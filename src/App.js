import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Plus, Trash2, Edit3, Check, X, Settings, LogOut } from 'lucide-react'; // Bell was unused

const CalendarScheduler = () => {
  // Main state management
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [gisTokenClient, setGisTokenClient] = useState(null);
  const [areGoogleLibsLoaded, setAreGoogleLibsLoaded] = useState(false); // Renamed from gapiLoaded for clarity

  const [currentStep, setCurrentStep] = useState('setup'); // Or 'auth' if not authenticated
  const [userSettings, setUserSettings] = useState({
    dailyTimeWindow: { start: '06:00', end: '22:00' },
    duration: 7, // days
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
  const [constantActivities, setConstantActivities] = useState([]);
  const [flexibleActivities, setFlexibleActivities] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false); // For general loading states (API calls, sign-in process)
  const [initLoading, setInitLoading] = useState(true); // Specifically for initial library loading
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


  const handleGisCallback = useCallback(async (tokenResponse) => {
    setLoading(false); // Sign-in process loading
    if (tokenResponse.error) {
      let errorMsg = tokenResponse.error;
      if (tokenResponse.error_description) errorMsg += `: ${tokenResponse.error_description}`;
      setError(`Authorization error: ${errorMsg}. Please ensure pop-ups are enabled and try again.`);
      setIsAuthenticated(false);
    } else if (tokenResponse.access_token) {
      sessionStorage.setItem('google_access_token', tokenResponse.access_token);
      if (window.gapi && window.gapi.client) {
        window.gapi.client.setToken({ access_token: tokenResponse.access_token });
      }
      setIsAuthenticated(true);
      setError('');
      await loadCalendarEvents();
      // Do not automatically navigate away from auth screen if currentStep implies user interaction needed
      // setCurrentStep('setup'); // Or based on where user was
    } else {
        setError('Received an empty token response. Please try again.');
        setIsAuthenticated(false);
    }
  }, []); // Removed loadCalendarEvents from deps, will call it explicitly

  // Initialize Google Identity Services (GIS) and GAPI client
  useEffect(() => {
    let gapiScriptNode;
    let gisScriptNode;

    const initializeLibraries = async () => {
      setInitLoading(true);
      setError('');

      if (!CLIENT_ID) {
        setError('Google Client ID is missing. Please check your environment variables.');
        setInitLoading(false);
        setAreGoogleLibsLoaded(false);
        return;
      }
      if (!API_KEY) {
        setError('Google API Key is missing. Please check your environment variables.');
        setInitLoading(false);
        setAreGoogleLibsLoaded(false);
        return;
      }

      try {
        // 1. Load GIS script
        await new Promise((resolve, reject) => {
          gisScriptNode = document.createElement('script');
          gisScriptNode.src = 'https://accounts.google.com/gsi/client';
          gisScriptNode.async = true;
          gisScriptNode.defer = true;
          gisScriptNode.onload = resolve;
          gisScriptNode.onerror = () => reject(new Error("Failed to load Google Identity Services script. Check network connection."));
          document.head.appendChild(gisScriptNode);
        });

        // 2. Load GAPI client script (needed for gapi.client.calendar)
        await new Promise((resolve, reject) => {
          gapiScriptNode = document.createElement('script');
          gapiScriptNode.src = 'https://apis.google.com/js/api.js';
          gapiScriptNode.async = true;
          gapiScriptNode.defer = true;
          gapiScriptNode.onload = () => window.gapi.load('client', resolve);
          gapiScriptNode.onerror = () => reject(new Error("Failed to load Google API client script (api.js). Check network connection."));
          document.head.appendChild(gapiScriptNode);
        });

        // 3. Initialize GAPI client for Calendar API (using API_KEY for discovery)
        await window.gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: [DISCOVERY_DOC],
        });
        
        // 4. Initialize GIS Token Client
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
            const tokenClient = window.google.accounts.oauth2.initTokenClient({
              client_id: CLIENT_ID,
              scope: SCOPES,
              prompt: '', // Keep empty for default behavior (usually no prompt if already consented)
              callback: handleGisCallback, 
            });
            setGisTokenClient(tokenClient);
        } else {
            throw new Error("Google Identity Services (GIS) not found on window after script load.");
        }

        setAreGoogleLibsLoaded(true); // All libraries are loaded and initialized
        setError('');
      } catch (err) {
        console.error("Error initializing Google libraries:", err);
        setError(`Initialization failed: ${err.message || String(err)}. Please ensure you are online and try refreshing.`);
        setAreGoogleLibsLoaded(false);
      } finally {
        setInitLoading(false);
      }
    };

    initializeLibraries();

    return () => { // Cleanup
      if (gapiScriptNode && gapiScriptNode.parentNode) gapiScriptNode.parentNode.removeChild(gapiScriptNode);
      if (gisScriptNode && gisScriptNode.parentNode) gisScriptNode.parentNode.removeChild(gisScriptNode);
    };
  }, [CLIENT_ID, API_KEY, SCOPES, handleGisCallback]);


  // Authentication functions
  const signIn = () => {
    if (loading || initLoading || !areGoogleLibsLoaded) return;

    if (!gisTokenClient) {
      setError('Google authentication service is not ready. Please wait or refresh the page.');
      console.error('gisTokenClient not initialized before signIn call.');
      return;
    }
    setError(''); // Clear previous errors
    setLoading(true); // For the sign-in process itself
    gisTokenClient.requestAccessToken({ prompt: 'consent' }); // Prompt for consent if needed or to select account
  };

  const signOut = () => {
    const token = sessionStorage.getItem('google_access_token');
    if (token && window.google && window.google.accounts && window.google.accounts.oauth2) {
      window.google.accounts.oauth2.revoke(token, () => { // Callback after revocation
        sessionStorage.removeItem('google_access_token');
        if (window.gapi && window.gapi.client) {
            window.gapi.client.setToken(null); // Clear token from gapi client
        }
        setIsAuthenticated(false);
        setCalendarEvents([]);
        setSuggestions([]);
        setCurrentStep('setup'); // Or a dedicated auth screen/state
        setError('');
        setLoading(false);
      });
    } else {
      // Fallback if no token or GIS revoke is unavailable
      sessionStorage.removeItem('google_access_token');
      if (window.gapi && window.gapi.client) {
          window.gapi.client.setToken(null);
      }
      setIsAuthenticated(false);
      setCalendarEvents([]);
      setCurrentStep('setup');
      setError('');
      setLoading(false);
    }
  };

  // Calendar API functions
  const loadCalendarEvents = async () => {
    const token = sessionStorage.getItem('google_access_token');
    if (!window.gapi || !window.gapi.client || !token) { // isAuthenticated check is implicitly handled by token presence
      //setError("Cannot load calendar events: not authenticated or GAPI client not ready.");
      if (!token && isAuthenticated) { // Was authenticated, but token is gone
          setError("Your session may have expired. Please sign in again.");
          signOut(); // Force sign out
      }
      return;
    }
    // Ensure GAPI client has the token (should be set by GIS callback, but good as a safeguard)
    window.gapi.client.setToken({ access_token: token });

    setLoading(true);
    try {
      const now = new Date();
      const timeMax = new Date(now.getTime() + userSettings.duration * 24 * 60 * 60 * 1000);
      
      const response = await window.gapi.client.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        showDeleted: false,
        singleEvents: true,
        orderBy: 'startTime'
      });
      
      setCalendarEvents(response.result.items || []);
      setError(''); // Clear previous errors on success
    } catch (err) {
      console.error('Load calendar events error:', err);
      if (err.status === 401 || (err.result && err.result.error && err.result.error.status === 'UNAUTHENTICATED')) {
          setError('Your session has expired or permissions were revoked. Please sign in again.');
          signOut(); 
      } else {
        const message = (err.result && err.result.error && err.result.error.message) || err.message || 'Unknown error';
        setError('Failed to load calendar events: ' + message);
      }
    } finally {
      setLoading(false);
    }
  };

  const createCalendarEvent = async (event) => {
    const token = sessionStorage.getItem('google_access_token');
    if (!window.gapi || !window.gapi.client || !token) {
      setError('Cannot create event: not authenticated or Google API client not ready.');
      return null;
    }
    window.gapi.client.setToken({ access_token: token });
    
    setLoading(true); // Indicate activity
    try {
      const response = await window.gapi.client.calendar.events.insert({
        calendarId: 'primary',
        resource: event
      });
      setError(''); // Clear error on success
      return response.result;
    } catch (err) {
      console.error('Create calendar event error:', err);
       if (err.status === 401 || (err.result && err.result.error && err.result.error.status === 'UNAUTHENTICATED')) {
          setError('Your session has expired or permissions were revoked. Please sign in again to create events.');
          signOut();
      } else {
        const message = (err.result && err.result.error && err.result.error.message) || err.message || 'Unknown error';
        setError('Failed to create event: ' + message);
      }
      return null;
    } finally {
        setLoading(false);
    }
  };

  // Time slot generation (no changes needed for auth migration)
  const generateTimeSlots = () => {
    const slots = [];
    const startTime = new Date(); 
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
      
      for (let time = new Date(dayStart); time < dayEnd; time.setMinutes(time.getMinutes() + 30)) {
        const slotEnd = new Date(time.getTime() + 30 * 60 * 1000);
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

  // findAvailableSlots (no changes needed for auth migration)
  const findAvailableSlots = () => {
    const allSlots = generateTimeSlots();
    const busyTimes = [...calendarEvents];
    constantActivities.forEach(activity => {
      const days = activity.days || [0, 1, 2, 3, 4, 5, 6]; 
      const today = new Date();
      today.setHours(0,0,0,0); 

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
        const eventStartStr = event.start?.dateTime || event.start?.date;
        const eventEndStr = event.end?.dateTime || event.end?.date;
        if (!eventStartStr || !eventEndStr) return false; 
        const eventStart = new Date(eventStartStr);
        const eventEnd = new Date(eventEndStr);
        if (event.start?.date && !event.start?.dateTime) {
             eventEnd.setHours(23, 59, 59, 999);
        }
        return (slot.start < eventEnd && slot.end > eventStart);
      });
    });
  };
  
  // generateSuggestions (no changes needed for auth migration)
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
          const slotsNeeded = Math.ceil(activity.duration / 30); 
          const today = new Date();
          today.setHours(0,0,0,0);
          for (let i = 0; i < userSettings.duration; i++) {
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() + i);
            const daySlots = availableSlots.filter(slot => 
              slot.start.getFullYear() === targetDate.getFullYear() &&
              slot.start.getMonth() === targetDate.getMonth() &&
              slot.start.getDate() === targetDate.getDate()
            );
            for (let j = 0; j <= daySlots.length - slotsNeeded; j++) {
              const potentialConsecutiveSlots = daySlots.slice(j, j + slotsNeeded);
              let isConsecutive = true;
              for (let k = 0; k < potentialConsecutiveSlots.length -1; k++) {
                if (potentialConsecutiveSlots[k].end.getTime() !== potentialConsecutiveSlots[k+1].start.getTime()) {
                    isConsecutive = false;
                    break;
                }
              }
              if (isConsecutive && potentialConsecutiveSlots.length === slotsNeeded) {
                newSuggestions.push({
                  id: `${activity.name}-${targetDate.toISOString().split('T')[0]}-${j}`, 
                  activityName: activity.name,
                  start: potentialConsecutiveSlots[0].start,
                  end: potentialConsecutiveSlots[potentialConsecutiveSlots.length - 1].end,
                  duration: activity.duration, 
                  accepted: false
                });
                 break; 
              }
            }
          }
        });
        if (newSuggestions.length === 0 && flexibleActivities.length > 0) {
            setError("No available time slots found for your flexible activities within the defined constraints. Try adjusting your time window or constant activities.");
        }
        setSuggestions(newSuggestions);
    } catch (e) {
        console.error("Error generating suggestions:", e);
        setError("An error occurred while generating suggestions: " + e.message);
    } finally {
        setLoading(false);
    }
  };

  // UI-related functions (acceptSuggestion, rejectSuggestion, finalizeSchedule, add/remove activities)
  // No direct changes for auth migration, but they rely on error/loading states.

  const acceptSuggestion = (suggestionId) => {
    setSuggestions(prev => prev.map(s => 
      s.id === suggestionId ? {...s, accepted: true} : s
    ));
  };

  const rejectSuggestion = (suggestionId) => {
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
  };

  const finalizeSchedule = async () => {
    setLoading(true); // Use general loading
    setError('');
    const acceptedSuggestions = suggestions.filter(s => s.accepted);
    let successCount = 0;
    
    try {
      for (const suggestion of acceptedSuggestions) {
        const event = {
          summary: suggestion.activityName,
          start: { dateTime: suggestion.start.toISOString(), timeZone: userSettings.timezone },
          end: { dateTime: suggestion.end.toISOString(), timeZone: userSettings.timezone },
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] }
        };
        const createdEvent = await createCalendarEvent(event); // createCalendarEvent handles its own loading state
        if (createdEvent) {
            successCount++;
        } else {
            // If a single event creation fails, an error is already set by createCalendarEvent.
            // We might want to stop or inform the user more specifically.
            // For now, it will try to continue with other events.
        }
      }
      
      if (successCount > 0) {
        await loadCalendarEvents(); // Refresh calendar events
      }
      setSuggestions(prev => prev.filter(s => !s.accepted)); // Clear accepted ones
      if(error === '') { // Only go to complete if no errors during creation
        setCurrentStep('complete');
      }
    } catch (err) {
      // This catch is for unexpected errors in the loop itself, not from createCalendarEvent
      setError('Failed to finalize schedule: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const addConstantActivity = () => {
    if (newConstantActivity.name.trim() && newConstantActivity.duration > 0) {
      setConstantActivities(prev => [...prev, {...newConstantActivity, id: Date.now()}]);
      setNewConstantActivity({ name: '', startTime: '09:00', duration: 60, days: [1, 2, 3, 4, 5] });
      setError('');
    } else {
        setError("Constant activity name cannot be empty and duration must be greater than 0.");
    }
  };

  const removeConstantActivity = (id) => {
    setConstantActivities(prev => prev.filter(a => a.id !== id));
  };

  const addFlexibleActivity = () => {
    if (newFlexibleActivity.name.trim() && newFlexibleActivity.duration > 0) {
      setFlexibleActivities(prev => [...prev, {...newFlexibleActivity, id: Date.now()}]);
      setNewFlexibleActivity({ name: '', duration: 60, days: [] });
      setError('');
    } else {
        setError("Flexible activity name cannot be empty and duration must be greater than 0.");
    }
  };

  const removeFlexibleActivity = (id) => {
    setFlexibleActivities(prev => prev.filter(a => a.id !== id));
  };

  // Component Renders
  const renderAuthScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <Calendar className="mx-auto h-16 w-16 text-indigo-600 mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Smart Calendar Scheduler</h1>
          <p className="text-gray-600">Log in with Google to intelligently schedule your activities.</p>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm whitespace-pre-wrap">
            {error}
          </div>
        )}

        {(!CLIENT_ID || !API_KEY) && !initLoading && ( // Show only if keys are missing and not during initial load
          <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg text-yellow-700 text-sm">
            <p className="font-medium mb-2">Configuration Required</p>
            <p>Google API credentials (Client ID or API Key) are missing. Please ensure REACT_APP_GOOGLE_CLIENT_ID and REACT_APP_GOOGLE_API_KEY are set in your environment.</p>
          </div>
        )}
        
        <button
          onClick={signIn}
          disabled={initLoading || loading || !areGoogleLibsLoaded || !CLIENT_ID || !API_KEY}
          className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {initLoading ? 'Initializing...' : (loading ? 'Connecting...' : (areGoogleLibsLoaded ? 'Connect Google Calendar' : 'Loading Libraries...'))}
        </button>
        
        <div className="mt-6 text-xs text-gray-500">
          <p>This app requires access to your Google Calendar.</p>
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
            <button onClick={signOut} title="Sign Out & Clear Data" className="text-gray-500 hover:text-gray-700">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
          {error && ( <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm whitespace-pre-wrap">{error}</div>)}
          <div className="space-y-6">
            {/* Form elements for dailyTimeWindow and duration */}
            <div>
              <label htmlFor="dailyStartTime" className="block text-sm font-medium text-gray-700 mb-2">Daily Time Window</label>
              <div className="flex space-x-4">
                <div className="flex-1">
                  <label htmlFor="dailyStartTime" className="block text-xs text-gray-500 mb-1">Start Time</label>
                  <input id="dailyStartTime" type="time" value={userSettings.dailyTimeWindow.start} onChange={(e) => setUserSettings(prev => ({ ...prev, dailyTimeWindow: {...prev.dailyTimeWindow, start: e.target.value}}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                </div>
                <div className="flex-1">
                  <label htmlFor="dailyEndTime" className="block text-xs text-gray-500 mb-1">End Time</label>
                  <input id="dailyEndTime" type="time" value={userSettings.dailyTimeWindow.end} onChange={(e) => setUserSettings(prev => ({ ...prev, dailyTimeWindow: {...prev.dailyTimeWindow, end: e.target.value}}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                </div>
              </div>
            </div>
            <div>
              <label htmlFor="schedulingDuration" className="block text-sm font-medium text-gray-700 mb-2">Scheduling Duration</label>
              <select id="schedulingDuration" value={userSettings.duration} onChange={(e) => setUserSettings(prev => ({...prev, duration: parseInt(e.target.value)}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                <option value={7}>1 Week</option> <option value={14}>2 Weeks</option> <option value={30}>1 Month</option>
              </select>
            </div>
            <button onClick={() => {setError(''); setCurrentStep('constants');}} className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
              Next: Define Constant Activities
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
            {error && (<div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm whitespace-pre-wrap">{error}</div>)}
            <div className="grid lg:grid-cols-2 gap-6">
              <div> {/* Add New Activity Form */}
                <h3 className="text-lg font-semibold mb-4">Add New Activity</h3>
                <div className="space-y-4">
                  <input type="text" placeholder="Activity name (e.g., Work, Gym)" value={newConstantActivity.name} onChange={(e) => setNewConstantActivity(prev => ({...prev, name: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                  <div className="flex space-x-4">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-700 mb-1">Start Time</label>
                      <input type="time" value={newConstantActivity.startTime} onChange={(e) => setNewConstantActivity(prev => ({...prev, startTime: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm text-gray-700 mb-1">Duration (minutes)</label>
                      <input type="number" min="1" value={newConstantActivity.duration} onChange={(e) => setNewConstantActivity(prev => ({...prev, duration: parseInt(e.target.value) || 0}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Days of Week</label>
                    <div className="flex flex-wrap gap-2">
                      {dayNames.map((day, index) => (
                        <button key={index} type="button" onClick={() => { const newDays = newConstantActivity.days.includes(index) ? newConstantActivity.days.filter(d => d !== index) : [...newConstantActivity.days, index].sort((a,b)=>a-b); setNewConstantActivity(prev => ({...prev, days: newDays})); }} className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${ newConstantActivity.days.includes(index) ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}> {day} </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={addConstantActivity} disabled={!newConstantActivity.name.trim() || newConstantActivity.duration <= 0} className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"> <Plus className="inline h-4 w-4 mr-2" /> Add Activity </button>
                </div>
              </div>
              <div> {/* Current Activities List */}
                <h3 className="text-lg font-semibold mb-4">Current Constant Activities</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {constantActivities.map(activity => (
                    <div key={activity.id} className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div> <h4 className="font-medium text-gray-900">{activity.name}</h4> <p className="text-sm text-gray-600">{activity.startTime} • {activity.duration} minutes</p> <p className="text-sm text-gray-600">{activity.days.map(d => dayNames[d]).join(', ')}</p> </div>
                        <button onClick={() => removeConstantActivity(activity.id)} title="Remove Activity" className="text-red-500 hover:text-red-700"> <Trash2 className="h-4 w-4" /> </button>
                      </div>
                    </div>
                  ))}
                  {constantActivities.length === 0 && (<p className="text-gray-500 text-center py-8">No constant activities added yet.</p>)}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={() => {setError(''); setCurrentStep('setup');}} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Back</button>
              <button onClick={() => {setError(''); setCurrentStep('flexible');}} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Next: Flexible Activities</button>
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
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Define Flexible Activities</h2>
            {error && (<div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm whitespace-pre-wrap">{error}</div>)}
            <div className="grid lg:grid-cols-2 gap-6">
              <div> {/* Add New Flexible Activity Form */}
                <h3 className="text-lg font-semibold mb-4">Add New Activity</h3>
                <div className="space-y-4">
                  <input type="text" placeholder="Activity name (e.g., Reading, Project Work)" value={newFlexibleActivity.name} onChange={(e) => setNewFlexibleActivity(prev => ({...prev, name: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Duration per session (minutes)</label>
                    <input type="number" min="1" value={newFlexibleActivity.duration} onChange={(e) => setNewFlexibleActivity(prev => ({...prev, duration: parseInt(e.target.value) || 0}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                  </div>
                  <button onClick={addFlexibleActivity} disabled={!newFlexibleActivity.name.trim() || newFlexibleActivity.duration <=0} className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"> <Plus className="inline h-4 w-4 mr-2" /> Add Activity </button>
                </div>
              </div>
              <div> {/* Current Flexible Activities List */}
                <h3 className="text-lg font-semibold mb-4">Current Flexible Activities</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {flexibleActivities.map(activity => (
                    <div key={activity.id} className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div> <h4 className="font-medium text-gray-900">{activity.name}</h4> <p className="text-sm text-gray-600">{activity.duration} minutes per session</p> </div>
                        <button onClick={() => removeFlexibleActivity(activity.id)} title="Remove Activity" className="text-red-500 hover:text-red-700"> <Trash2 className="h-4 w-4" /> </button>
                      </div>
                    </div>
                  ))}
                  {flexibleActivities.length === 0 && (<p className="text-gray-500 text-center py-8">No flexible activities added yet.</p>)}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={() => {setError(''); setCurrentStep('constants');}} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Back</button>
              <button onClick={() => { setError(''); generateSuggestions(); setCurrentStep('suggestions');}} disabled={flexibleActivities.length === 0 || loading} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"> {loading ? "Generating..." : "Generate Suggestions"} </button>
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
          {error && (<div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm whitespace-pre-wrap">{error}</div>)}
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {suggestions.map(suggestion => (
              <div key={suggestion.id} className={`p-4 rounded-lg ${suggestion.accepted ? 'bg-green-50' : 'bg-gray-50'}`}>
                <div className="flex justify-between items-start">
                  <div> <h4 className="font-medium text-gray-900">{suggestion.activityName}</h4> <p className="text-sm text-gray-600"> {suggestion.start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • {suggestion.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {suggestion.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} </p> <p className="text-sm text-gray-600">{suggestion.duration} minutes</p> </div>
                  {!suggestion.accepted && ( <div className="flex space-x-2"> <button onClick={() => acceptSuggestion(suggestion.id)} title="Accept Suggestion" className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-green-100 hover:text-green-600 transition-colors"> <Check className="h-4 w-4" /> </button> <button onClick={() => rejectSuggestion(suggestion.id)} title="Reject Suggestion" className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors"> <X className="h-4 w-4" /> </button> </div> )}
                  {suggestion.accepted && (<div className="p-2 rounded-lg bg-green-100 text-green-600 flex items-center"> <Check className="h-4 w-4 mr-1" /> Accepted </div>)}
                </div>
              </div>
            ))}
            {suggestions.length === 0 && !loading && (<p className="text-gray-500 text-center py-8">No new suggestions available. Adjust activities or click "Back".</p>)}
            {loading && suggestions.length === 0 && (<p className="text-gray-500 text-center py-8">Finding best slots...</p>)}
          </div>
          <div className="mt-6 flex justify-between">
            <button onClick={() => {setError(''); setCurrentStep('flexible');}} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Back</button>
            <button onClick={finalizeSchedule} disabled={suggestions.filter(s => s.accepted).length === 0 || loading} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"> {loading ? 'Scheduling...' : `Finalize ${suggestions.filter(s => s.accepted).length} Item(s)`} </button>
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
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4"> <Check className="h-8 w-8 text-green-600" /> </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Schedule Updated!</h2>
            <p className="text-gray-600">Accepted activities have been added to your Google Calendar.</p>
          </div>
           {error && (<div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm whitespace-pre-wrap">{error}</div>)}
          <div className="bg-gray-50 p-4 rounded-lg mb-6"> <h3 className="font-medium text-gray-900 mb-2">Summary</h3> <p className="text-sm text-gray-600"> Successfully added events to your calendar. </p> </div>
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
            <button onClick={() => { setError(''); setCurrentStep('setup'); setConstantActivities([]); setFlexibleActivities([]); setSuggestions([]); setCalendarEvents([]); if (isAuthenticated) loadCalendarEvents(); }} className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"> Start Over / Plan More </button>
            <button onClick={() => window.open('https://calendar.google.com', '_blank')} className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"> View Google Calendar </button>
          </div>
        </div>
      </div>
    </div>
  );


  // Main Render Logic
  if (initLoading) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="text-center">
                <Calendar className="mx-auto h-16 w-16 text-indigo-600 mb-4 animate-pulse" />
                <p className="text-lg text-gray-700">Initializing Smart Scheduler...</p>
                 {error && (<div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm whitespace-pre-wrap">{error}</div>)}
            </div>
        </div>
    );
  }

  if (!isAuthenticated || !areGoogleLibsLoaded) { // If not authenticated OR if libraries failed to load (e.g. missing keys showed error)
    return renderAuthScreen();
  }

  // If authenticated and libraries are loaded, proceed to current step
  switch (currentStep) {
    case 'setup': return renderSetupScreen();
    case 'constants': return renderConstantActivities();
    case 'flexible': return renderFlexibleActivities();
    case 'suggestions': return renderSuggestions();
    case 'complete': return renderComplete();
    default: return renderSetupScreen();
  }
};

export default CalendarScheduler;
