import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, Trash2, Edit3, Check, X, Settings, LogOut, Bell } from 'lucide-react';

const CalendarScheduler = () => {
  // Main state management
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [gapi, setGapi] = useState(null);
  const [gapiLoaded, setGapiLoaded] = useState(false);
  const [currentStep, setCurrentStep] = useState('setup');
  const [userSettings, setUserSettings] = useState({
    dailyTimeWindow: { start: '06:00', end: '22:00' },
    duration: 7, // days
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
  const [constantActivities, setConstantActivities] = useState([]);
  const [flexibleActivities, setFlexibleActivities] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state for constant activities
  const [newConstantActivity, setNewConstantActivity] = useState({
    name: '',
    startTime: '09:00',
    duration: 60,
    days: [1, 2, 3, 4, 5] // Weekdays
  });

  // Form state for flexible activities
  const [newFlexibleActivity, setNewFlexibleActivity] = useState({
    name: '',
    duration: 60,
    days: []
  });

  // Google Calendar API configuration
  const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
  const API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;
  const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
  const SCOPES = 'https://www.googleapis.com/auth/calendar';

  // Initialize Google API
  useEffect(() => {
    const initializeGapi = async () => {
      try {
        if (!CLIENT_ID || !API_KEY) {
          setError('Google API Client ID or API Key is missing. Please check your environment variables.');
          setGapiLoaded(false);
          return;
        }

        if (!window.gapi) {
          // This case should ideally be handled by the script loader's onerror,
          // but as a safeguard:
          throw new Error('Google API script not available');
        }

        // Load client and auth2 libraries
        await new Promise((resolve, reject) => {
          window.gapi.load('client:auth2', {
            callback: resolve,
            onerror: (err) => reject(new Error('Failed to load client:auth2 libraries')),
            // timeout: 5000, // Optional: implement timeout
            // ontimeout: () => reject(new Error('Timeout loading client:auth2 libraries'))
          });
        });

        // Initialize auth2
        await window.gapi.auth2.init({
          client_id: CLIENT_ID,
        });

        // Initialize client
        await window.gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: [DISCOVERY_DOC],
        });

        setGapi(window.gapi);
        setGapiLoaded(true);
        setError('');

        // Check if user is already signed in
        const authInstance = window.gapi.auth2.getAuthInstance();
        if (authInstance && authInstance.isSignedIn.get()) {
          setIsAuthenticated(true);
          await loadCalendarEvents();
        }

      } catch (err) {
        console.error('Failed to initialize Google API:', err);
        let errorMessage = 'Unknown error during GAPI initialization.';
        if (err && err.message) {
          errorMessage = err.message;
        } else if (err && err.details) {
          errorMessage = err.details;
        } else if (err && err.result && err.result.error && err.result.error.message) {
          errorMessage = err.result.error.message;
        } else if (typeof err === 'string') {
          errorMessage = err;
        } else if (err && err.error && typeof err.error === 'string') { // For cases like {error: "idpiframe_initialization_failed"}
           errorMessage = err.error;
        }
        setError(`Failed to initialize Google API: ${errorMessage}`);
        setGapiLoaded(false);
      }
    };

    // Load Google API script if not already loaded
    if (!window.gapi) {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        console.log('Google API script loaded');
        if (window.gapi) {
            initializeGapi();
        } else {
            setError('window.gapi not available after script load.');
            setGapiLoaded(false);
        }
      };
      script.onerror = () => {
        setError('Failed to load Google API script. Check network connection and script URL.');
        setGapiLoaded(false);
      };
      document.body.appendChild(script);
    } else {
      initializeGapi();
    }
  }, [CLIENT_ID, API_KEY]); // Dependencies for useEffect

  // Authentication functions
  const signIn = async () => {
    if (!gapi || !gapiLoaded) {
      setError('Google API not ready. Please wait or check error messages and try again.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const authInstance = gapi.auth2.getAuthInstance();
      if (!authInstance) {
        // This case should ideally be prevented by gapiLoaded check
        throw new Error('Google Auth instance not initialized. Please ensure API loaded correctly.');
      }

      if (authInstance.isSignedIn.get()) {
        setIsAuthenticated(true);
        await loadCalendarEvents();
        setLoading(false);
        return;
      }

      const user = await authInstance.signIn({
        scope: SCOPES
      });

      if (!user || !user.hasGrantedScopes(SCOPES)) {
        throw new Error('Sign in failed or required calendar permissions were not granted.');
      }

      setIsAuthenticated(true);
      await loadCalendarEvents();

    } catch (err) {
      console.error('Sign in error:', err);
      let errorMessage = 'Unknown error during sign-in.';
       if (err && err.message) {
          errorMessage = err.message;
        } else if (err && err.details) { // For GAPI errors
          errorMessage = err.details;
        } else if (err && err.error && typeof err.error === 'string') { // e.g. "popup_closed_by_user"
          errorMessage = err.error;
        } else if (err && err.result && err.result.error && err.result.error.message) {
          errorMessage = err.result.error.message;
        } else if (typeof err === 'string') {
          errorMessage = err;
        }
      setError(`Sign in failed: ${errorMessage}`);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    if (!gapi || !gapi.auth2) return;
    
    try {
      const authInstance = gapi.auth2.getAuthInstance();
      if (authInstance) {
        await authInstance.signOut();
      }
      setIsAuthenticated(false);
      setCurrentStep('setup');
      setCalendarEvents([]);
      setSuggestions([]);
      setError('');
    } catch (err) {
      console.error('Sign out error:', err);
      setError('Failed to sign out: ' + (err.message || 'Unknown error'));
    }
  };

  // Calendar API functions
  const loadCalendarEvents = async () => {
    if (!gapi || !gapi.client || !isAuthenticated) return;
    
    try {
      setLoading(true);
      const now = new Date();
      const timeMax = new Date(now.getTime() + userSettings.duration * 24 * 60 * 60 * 1000);
      
      const response = await gapi.client.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        showDeleted: false,
        singleEvents: true,
        orderBy: 'startTime'
      });
      
      setCalendarEvents(response.result.items || []);
    } catch (err) {
      console.error('Load calendar events error:', err);
      let errorMessage = 'Unknown error loading calendar events.';
       if (err && err.message) {
          errorMessage = err.message;
        } else if (err && err.result && err.result.error && err.result.error.message) {
          errorMessage = err.result.error.message;
        } else if (typeof err === 'string') {
          errorMessage = err;
        }
      setError('Failed to load calendar events: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const createCalendarEvent = async (event) => {
    if (!gapi || !gapi.client || !isAuthenticated) return null;
    
    try {
      const response = await gapi.client.calendar.events.insert({
        calendarId: 'primary',
        resource: event
      });
      return response.result;
    } catch (err) {
      console.error('Create calendar event error:', err);
      let errorMessage = 'Unknown error creating event.';
       if (err && err.message) {
          errorMessage = err.message;
        } else if (err && err.result && err.result.error && err.result.error.message) {
          errorMessage = err.result.error.message;
        } else if (typeof err === 'string') {
          errorMessage = err;
        }
      setError('Failed to create event: ' + errorMessage);
      return null;
    }
  };

  // Time slot generation
  const generateTimeSlots = () => {
    const slots = [];
    const startTime = new Date(); // Schedules from today
    const localStartTime = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());


    for (let i = 0; i < userSettings.duration; i++) {
      const currentDate = new Date(localStartTime);
      currentDate.setDate(localStartTime.getDate() + i);
      
      const dayStart = new Date(currentDate);
      const [startHour, startMin] = userSettings.dailyTimeWindow.start.split(':');
      dayStart.setHours(parseInt(startHour), parseInt(startMin), 0, 0);
      
      const dayEnd = new Date(currentDate);
      const [endHour, endMin] = userSettings.dailyTimeWindow.end.split(':');
      dayEnd.setHours(parseInt(endHour), parseInt(endMin), 0, 0);
      
      // Generate 30-minute slots
      for (let time = new Date(dayStart); time < dayEnd; time.setMinutes(time.getMinutes() + 30)) {
        const slotEnd = new Date(time.getTime() + 30 * 60 * 1000);
        // Ensure the slot does not exceed the dayEnd
        if (slotEnd <= dayEnd) {
            slots.push({
              start: new Date(time),
              end: slotEnd,
              available: true
            });
        }
      }
    }
    return slots;
  };

  const findAvailableSlots = () => {
    const allSlots = generateTimeSlots();
    
    const busyTimes = [...calendarEvents];
    constantActivities.forEach(activity => {
      const days = activity.days || [0, 1, 2, 3, 4, 5, 6]; // Default to all days if not specified
      const today = new Date();
      today.setHours(0,0,0,0); // Start from the beginning of today

      for (let i = 0; i < userSettings.duration; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        
        if (days.includes(date.getDay())) {
          const startTime = new Date(date);
          const [hour, min] = activity.startTime.split(':');
          startTime.setHours(parseInt(hour), parseInt(min), 0, 0);
          const endTime = new Date(startTime.getTime() + activity.duration * 60 * 1000);
          
          busyTimes.push({
            start: { dateTime: startTime.toISOString() },
            end: { dateTime: endTime.toISOString() }
          });
        }
      }
    });
    
    return allSlots.filter(slot => {
      return !busyTimes.some(event => {
        // Handle both all-day events and timed events
        const eventStartStr = event.start?.dateTime || event.start?.date;
        const eventEndStr = event.end?.dateTime || event.end?.date;

        if (!eventStartStr || !eventEndStr) return false; // Skip if event has no start/end

        const eventStart = new Date(eventStartStr);
        const eventEnd = new Date(eventEndStr);
        
        // If it's an all-day event (only date, no time), adjust end time to end of day for comparison
        if (event.start?.date && !event.start?.dateTime) {
             eventEnd.setDate(eventEnd.getDate()); // Make sure it covers the whole last day
             eventEnd.setHours(23, 59, 59, 999);
        }


        return (slot.start < eventEnd && slot.end > eventStart);
      });
    });
  };

  const generateSuggestions = () => {
    if (flexibleActivities.length === 0) {
        setSuggestions([]);
        setError("Please add at least one flexible activity to generate suggestions.");
        return;
    }
    setLoading(true);
    setError('');
    try {
        const availableSlots = findAvailableSlots();
        const newSuggestions = [];
        
        flexibleActivities.forEach(activity => {
          const slotsNeeded = Math.ceil(activity.duration / 30); // Assuming 30 min slots
          
          // Iterate through each day within the scheduling duration
          const today = new Date();
          today.setHours(0,0,0,0);

          for (let i = 0; i < userSettings.duration; i++) {
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() + i);

            // Filter available slots for the current targetDate
            const daySlots = availableSlots.filter(slot => 
              slot.start.getFullYear() === targetDate.getFullYear() &&
              slot.start.getMonth() === targetDate.getMonth() &&
              slot.start.getDate() === targetDate.getDate()
            );
            
            // Find consecutive slots
            for (let j = 0; j <= daySlots.length - slotsNeeded; j++) {
              const potentialConsecutiveSlots = daySlots.slice(j, j + slotsNeeded);
              
              // Check if these slots are truly consecutive
              let isConsecutive = true;
              for (let k = 0; k < potentialConsecutiveSlots.length -1; k++) {
                if (potentialConsecutiveSlots[k].end.getTime() !== potentialConsecutiveSlots[k+1].start.getTime()) {
                    isConsecutive = false;
                    break;
                }
              }

              if (isConsecutive && potentialConsecutiveSlots.length === slotsNeeded) {
                newSuggestions.push({
                  id: `${activity.name}-${targetDate.toISOString().split('T')[0]}-${j}`, // More robust ID
                  activityName: activity.name,
                  start: potentialConsecutiveSlots[0].start,
                  end: potentialConsecutiveSlots[potentialConsecutiveSlots.length - 1].end,
                  duration: activity.duration, // Store the original flexible activity duration
                  accepted: false
                });
                // Found a slot for this activity on this day, can break to look for next activity or next day
                // If you want multiple suggestions for the same activity, remove this break.
                // For this implementation, let's assume one suggestion per flexible activity per day if possible.
                // This break is inside the j loop (slot finding loop for a day)
                 break; 
              }
            }
          }
        });
        
        if (newSuggestions.length === 0) {
            setError("No available time slots found for your flexible activities within the defined constraints.");
        }
        setSuggestions(newSuggestions);

    } catch (e) {
        console.error("Error generating suggestions:", e);
        setError("An error occurred while generating suggestions: " + e.message);
    } finally {
        setLoading(false);
    }
  };


  const acceptSuggestion = (suggestionId) => {
    setSuggestions(prev => prev.map(s => 
      s.id === suggestionId ? {...s, accepted: true} : s
    ));
  };

  const rejectSuggestion = (suggestionId) => {
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
  };

  const finalizeSchedule = async () => {
    setLoading(true);
    setError('');
    const acceptedSuggestions = suggestions.filter(s => s.accepted);
    let successCount = 0;
    
    try {
      for (const suggestion of acceptedSuggestions) {
        const event = {
          summary: suggestion.activityName,
          start: {
            dateTime: suggestion.start.toISOString(),
            timeZone: userSettings.timezone
          },
          end: {
            dateTime: suggestion.end.toISOString(),
            timeZone: userSettings.timezone
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 10 }
            ]
          }
        };
        
        const createdEvent = await createCalendarEvent(event);
        if (createdEvent) {
            successCount++;
        }
      }
      
      if (successCount > 0) {
        await loadCalendarEvents(); // Refresh calendar events
      }
      // Update suggestions to remove accepted ones or mark as fully processed if needed
      setSuggestions(prev => prev.filter(s => !s.accepted));
      setCurrentStep('complete');

    } catch (err) {
      // Error handling is already inside createCalendarEvent,
      // but an additional catch here can handle other unexpected issues.
      setError('Failed to finalize schedule: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Constant activity functions
  const addConstantActivity = () => {
    if (newConstantActivity.name.trim() && newConstantActivity.duration > 0) {
      setConstantActivities(prev => [...prev, {...newConstantActivity, id: Date.now()}]);
      setNewConstantActivity({
        name: '',
        startTime: '09:00',
        duration: 60,
        days: [1, 2, 3, 4, 5]
      });
    } else {
        setError("Activity name cannot be empty and duration must be greater than 0.");
    }
  };

  const removeConstantActivity = (id) => {
    setConstantActivities(prev => prev.filter(a => a.id !== id));
  };

  // Flexible activity functions
  const addFlexibleActivity = () => {
    if (newFlexibleActivity.name.trim() && newFlexibleActivity.duration > 0) {
      setFlexibleActivities(prev => [...prev, {...newFlexibleActivity, id: Date.now()}]);
      setNewFlexibleActivity({
        name: '',
        duration: 60,
        days: [] // Days might not be relevant here as per current logic, or could be used for preference
      });
    } else {
        setError("Activity name cannot be empty and duration must be greater than 0.");
    }
  };

  const removeFlexibleActivity = (id) => {
    setFlexibleActivities(prev => prev.filter(a => a.id !== id));
  };

  // Component renders
  const renderAuthScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <Calendar className="mx-auto h-16 w-16 text-indigo-600 mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Smart Calendar Scheduler</h1>
          <p className="text-gray-600">Optimize your daily schedule with AI-powered suggestions</p>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm whitespace-pre-wrap">
            {error}
          </div>
        )}

        {!CLIENT_ID || !API_KEY ? (
          <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg text-yellow-700 text-sm">
            <p className="font-medium mb-2">Configuration Required</p>
            <p>Google API credentials are missing. Please ensure REACT_APP_GOOGLE_CLIENT_ID and REACT_APP_GOOGLE_API_KEY are set in your environment.</p>
          </div>
        ) : null}
        
        <button
          onClick={signIn}
          disabled={loading || !gapiLoaded || !CLIENT_ID || !API_KEY}
          className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Connecting...' : gapiLoaded ? 'Connect Google Calendar' : 'Initializing GAPI...'}
        </button>
        
        <div className="mt-6 text-xs text-gray-500">
          <p>This app requires access to your Google Calendar to function.</p>
          <p>Your data is processed locally and not stored on external servers.</p>
        </div>
      </div>
    </div>
  );

  const renderSetupScreen = () => (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Initial Setup</h2>
            <button onClick={signOut} title="Sign Out" className="text-gray-500 hover:text-gray-700">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm  whitespace-pre-wrap">
              {error}
            </div>
          )}
          
          <div className="space-y-6">
            <div>
              <label htmlFor="dailyStartTime" className="block text-sm font-medium text-gray-700 mb-2">
                Daily Time Window
              </label>
              <div className="flex space-x-4">
                <div className="flex-1">
                  <label htmlFor="dailyStartTime" className="block text-xs text-gray-500 mb-1">Start Time</label>
                  <input
                    id="dailyStartTime"
                    type="time"
                    value={userSettings.dailyTimeWindow.start}
                    onChange={(e) => setUserSettings(prev => ({
                      ...prev,
                      dailyTimeWindow: {...prev.dailyTimeWindow, start: e.target.value}
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="dailyEndTime" className="block text-xs text-gray-500 mb-1">End Time</label>
                  <input
                    id="dailyEndTime"
                    type="time"
                    value={userSettings.dailyTimeWindow.end}
                    onChange={(e) => setUserSettings(prev => ({
                      ...prev,
                      dailyTimeWindow: {...prev.dailyTimeWindow, end: e.target.value}
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
            
            <div>
              <label htmlFor="schedulingDuration" className="block text-sm font-medium text-gray-700 mb-2">
                Scheduling Duration
              </label>
              <select
                id="schedulingDuration"
                value={userSettings.duration}
                onChange={(e) => setUserSettings(prev => ({...prev, duration: parseInt(e.target.value)}))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value={7}>1 Week</option>
                <option value={14}>2 Weeks</option>
                <option value={30}>1 Month</option>
              </select>
            </div>
            
            <button
              onClick={() => {setError(''); setCurrentStep('constants');}}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              Next: Define Daily Activities
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderConstantActivities = () => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Define Constant Daily Activities</h2>
             {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm whitespace-pre-wrap">
                    {error}
                </div>
            )}
            <div className="grid lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Add New Activity</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Activity name (e.g., Work, Gym)"
                    value={newConstantActivity.name}
                    onChange={(e) => setNewConstantActivity(prev => ({...prev, name: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  
                  <div className="flex space-x-4">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-700 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={newConstantActivity.startTime}
                        onChange={(e) => setNewConstantActivity(prev => ({...prev, startTime: e.target.value}))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm text-gray-700 mb-1">Duration (minutes)</label>
                      <input
                        type="number"
                        min="1"
                        value={newConstantActivity.duration}
                        onChange={(e) => setNewConstantActivity(prev => ({...prev, duration: parseInt(e.target.value) || 0}))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Days of Week</label>
                    <div className="flex flex-wrap gap-2">
                      {dayNames.map((day, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            const newDays = newConstantActivity.days.includes(index)
                              ? newConstantActivity.days.filter(d => d !== index)
                              : [...newConstantActivity.days, index].sort((a,b) => a-b);
                            setNewConstantActivity(prev => ({...prev, days: newDays}));
                          }}
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                            newConstantActivity.days.includes(index)
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {setError(''); addConstantActivity();}}
                    disabled={!newConstantActivity.name.trim() || newConstantActivity.duration <= 0}
                    className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="inline h-4 w-4 mr-2" />
                    Add Activity
                  </button>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-4">Current Activities</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {constantActivities.map(activity => (
                    <div key={activity.id} className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-900">{activity.name}</h4>
                          <p className="text-sm text-gray-600">
                            {activity.startTime} • {activity.duration} minutes
                          </p>
                          <p className="text-sm text-gray-600">
                            {activity.days.map(d => dayNames[d]).join(', ')}
                          </p>
                        </div>
                        <button
                          onClick={() => removeConstantActivity(activity.id)}
                          title="Remove Activity"
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {constantActivities.length === 0 && (
                    <p className="text-gray-500 text-center py-8">No constant activities added yet.</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-between">
              <button
                onClick={() => {setError(''); setCurrentStep('setup');}}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => {setError(''); setCurrentStep('flexible');}}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Next: Flexible Activities
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFlexibleActivities = () => {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Add Flexible Activities</h2>
            {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm whitespace-pre-wrap">
                    {error}
                </div>
            )}
            <div className="grid lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Add New Activity</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Activity name (e.g., Reading, Coding)"
                    value={newFlexibleActivity.name}
                    onChange={(e) => setNewFlexibleActivity(prev => ({...prev, name: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Duration per session (minutes)</label>
                    <input
                      type="number"
                      min="1"
                      value={newFlexibleActivity.duration}
                      onChange={(e) => setNewFlexibleActivity(prev => ({...prev, duration: parseInt(e.target.value) || 0}))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  
                  <button
                    onClick={() => {setError(''); addFlexibleActivity();}}
                    disabled={!newFlexibleActivity.name.trim() || newFlexibleActivity.duration <=0}
                    className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="inline h-4 w-4 mr-2" />
                    Add Activity
                  </button>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-4">Flexible Activities List</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {flexibleActivities.map(activity => (
                    <div key={activity.id} className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-900">{activity.name}</h4>
                          <p className="text-sm text-gray-600">{activity.duration} minutes per session</p>
                        </div>
                        <button
                          onClick={() => removeFlexibleActivity(activity.id)}
                          title="Remove Activity"
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {flexibleActivities.length === 0 && (
                    <p className="text-gray-500 text-center py-8">No flexible activities added yet.</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-between">
              <button
                onClick={() => {setError(''); setCurrentStep('constants');}}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => {
                  setError('');
                  generateSuggestions();
                  setCurrentStep('suggestions');
                }}
                disabled={flexibleActivities.length === 0 || loading}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Generating..." : "Generate Suggestions"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSuggestions = () => (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Scheduling Suggestions</h2>
          {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm whitespace-pre-wrap">
                    {error}
                </div>
            )}
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {suggestions.map(suggestion => (
              <div key={suggestion.id} className={`p-4 rounded-lg ${suggestion.accepted ? 'bg-green-50' : 'bg-gray-50'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-gray-900">{suggestion.activityName}</h4>
                    <p className="text-sm text-gray-600">
                      {suggestion.start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • {suggestion.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {suggestion.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                    <p className="text-sm text-gray-600">{suggestion.duration} minutes</p>
                  </div>
                  {!suggestion.accepted && (
                    <div className="flex space-x-2">
                        <button
                        onClick={() => acceptSuggestion(suggestion.id)}
                        title="Accept Suggestion"
                        className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-green-100 hover:text-green-600 transition-colors"
                        >
                        <Check className="h-4 w-4" />
                        </button>
                        <button
                        onClick={() => rejectSuggestion(suggestion.id)}
                        title="Reject Suggestion"
                        className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors"
                        >
                        <X className="h-4 w-4" />
                        </button>
                    </div>
                  )}
                   {suggestion.accepted && (
                     <div className="p-2 rounded-lg bg-green-100 text-green-600">
                        <Check className="h-4 w-4" /> Accepted
                     </div>
                   )}
                </div>
              </div>
            ))}
            
            {suggestions.length === 0 && !loading && (
              <p className="text-gray-500 text-center py-8">No suggestions available. Try adjusting your activities or time window.</p>
            )}
             {loading && (
              <p className="text-gray-500 text-center py-8">Loading suggestions...</p>
            )}
          </div>
          
          <div className="mt-6 flex justify-between">
            <button
              onClick={() => {setError('');setCurrentStep('flexible');}}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => {setError(''); finalizeSchedule();}}
              disabled={suggestions.filter(s => s.accepted).length === 0 || loading}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Scheduling...' : `Finalize ${suggestions.filter(s => s.accepted).length} item(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderComplete = () => (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Schedule Updated!</h2>
            <p className="text-gray-600">Accepted activities have been added to your Google Calendar.</p>
          </div>
          
          {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm whitespace-pre-wrap">
                    {error}
                </div>
            )}
          
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <h3 className="font-medium text-gray-900 mb-2">Summary</h3>
            <p className="text-sm text-gray-600">
              Successfully added {suggestions.filter(s => s.accepted).length} activities to your calendar.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
            <button
              onClick={() => {
                setError('');
                setCurrentStep('setup');
                // Keep settings, but clear activities and suggestions for a new plan
                setConstantActivities([]);
                setFlexibleActivities([]);
                setSuggestions([]); 
                setCalendarEvents([]); // Reload events for new setup
                if (isAuthenticated && gapiLoaded) loadCalendarEvents();
              }}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Plan More Activities
            </button>
            <button
              onClick={() => window.open('https://calendar.google.com', '_blank')}
              className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              View Google Calendar
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Main render logic
  if (!gapiLoaded && !error && (!CLIENT_ID || !API_KEY)) { // Initial state before useEffect runs and detects missing keys
     return renderAuthScreen(); // Show auth screen with config message if keys are known to be missing
  }

  if (!gapiLoaded && !error && CLIENT_ID && API_KEY) { // Still loading GAPI
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="text-center">
                <Calendar className="mx-auto h-16 w-16 text-indigo-600 mb-4 animate-pulse" />
                <p className="text-lg text-gray-700">Initializing Smart Scheduler...</p>
            </div>
        </div>
    );
  }
  
  if (!isAuthenticated || error.startsWith("Failed to initialize Google API")) { // If GAPI init failed, show auth screen with error
    return renderAuthScreen();
  }


  switch (currentStep) {
    case 'setup':
      return renderSetupScreen();
    case 'constants':
      return renderConstantActivities();
    case 'flexible':
      return renderFlexibleActivities();
    case 'suggestions':
      return renderSuggestions();
    case 'complete':
      return renderComplete();
    default:
      return renderSetupScreen();
  }
};

export default CalendarScheduler;