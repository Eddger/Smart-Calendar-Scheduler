import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, Trash2, Edit3, Check, X, Settings, LogOut, Bell } from 'lucide-react';

const CalendarScheduler = () => {
  // Main state management
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [gapi, setGapi] = useState(null);
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
      if (window.gapi) {
        await window.gapi.load('auth2', async () => {
          await window.gapi.auth2.init({
            client_id: CLIENT_ID,
          });
        });
        await window.gapi.load('client', async () => {
          await window.gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: [DISCOVERY_DOC],
          });
        });
        setGapi(window.gapi);
      }
    };

    // Load Google API script
    if (!window.gapi) {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = initializeGapi;
      document.body.appendChild(script);
    } else {
      initializeGapi();
    }
  }, [CLIENT_ID, API_KEY]);

  // Authentication functions
  const signIn = async () => {
    if (!gapi) return;
    try {
      setLoading(true);
      const authInstance = gapi.auth2.getAuthInstance();
      await authInstance.signIn();
      setIsAuthenticated(true);
      await loadCalendarEvents();
    } catch (err) {
      setError('Failed to sign in: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    if (!gapi) return;
    const authInstance = gapi.auth2.getAuthInstance();
    await authInstance.signOut();
    setIsAuthenticated(false);
    setCurrentStep('setup');
    setCalendarEvents([]);
    setSuggestions([]);
  };

  // Calendar API functions
  const loadCalendarEvents = async () => {
    if (!gapi) return;
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
      setError('Failed to load calendar events: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const createCalendarEvent = async (event) => {
    if (!gapi) return;
    try {
      const response = await gapi.client.calendar.events.insert({
        calendarId: 'primary',
        resource: event
      });
      return response.result;
    } catch (err) {
      setError('Failed to create event: ' + err.message);
      return null;
    }
  };

  // Time slot generation
  const generateTimeSlots = () => {
    const slots = [];
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + userSettings.duration * 24 * 60 * 60 * 1000);
    
    for (let d = new Date(startTime); d < endTime; d.setDate(d.getDate() + 1)) {
      const dayStart = new Date(d);
      const [startHour, startMin] = userSettings.dailyTimeWindow.start.split(':');
      dayStart.setHours(parseInt(startHour), parseInt(startMin), 0, 0);
      
      const dayEnd = new Date(d);
      const [endHour, endMin] = userSettings.dailyTimeWindow.end.split(':');
      dayEnd.setHours(parseInt(endHour), parseInt(endMin), 0, 0);
      
      // Generate 30-minute slots
      for (let time = new Date(dayStart); time < dayEnd; time.setMinutes(time.getMinutes() + 30)) {
        const slotEnd = new Date(time.getTime() + 30 * 60 * 1000);
        slots.push({
          start: new Date(time),
          end: slotEnd,
          available: true
        });
      }
    }
    
    return slots;
  };

  const findAvailableSlots = () => {
    const allSlots = generateTimeSlots();
    
    // Mark slots as unavailable based on existing events and constant activities
    const unavailableSlots = [...calendarEvents];
    constantActivities.forEach(activity => {
      // Add constant activities to unavailable slots
      const days = activity.days || [0, 1, 2, 3, 4, 5, 6];
      for (let i = 0; i < userSettings.duration; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        if (days.includes(date.getDay())) {
          const startTime = new Date(date);
          const [hour, min] = activity.startTime.split(':');
          startTime.setHours(parseInt(hour), parseInt(min), 0, 0);
          const endTime = new Date(startTime.getTime() + activity.duration * 60 * 1000);
          
          unavailableSlots.push({
            start: { dateTime: startTime.toISOString() },
            end: { dateTime: endTime.toISOString() }
          });
        }
      }
    });
    
    // Filter available slots
    return allSlots.filter(slot => {
      return !unavailableSlots.some(event => {
        const eventStart = new Date(event.start?.dateTime || event.start?.date);
        const eventEnd = new Date(event.end?.dateTime || event.end?.date);
        return (slot.start < eventEnd && slot.end > eventStart);
      });
    });
  };

  const generateSuggestions = () => {
    const availableSlots = findAvailableSlots();
    const newSuggestions = [];
    
    flexibleActivities.forEach(activity => {
      const slotsNeeded = Math.ceil(activity.duration / 30);
      const daysToSchedule = activity.days || Array.from({length: userSettings.duration}, (_, i) => i);
      
      daysToSchedule.forEach(dayOffset => {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + dayOffset);
        
        const daySlots = availableSlots.filter(slot => 
          slot.start.toDateString() === targetDate.toDateString()
        );
        
        // Find consecutive slots
        for (let i = 0; i <= daySlots.length - slotsNeeded; i++) {
          const consecutiveSlots = daySlots.slice(i, i + slotsNeeded);
          const isConsecutive = consecutiveSlots.every((slot, idx) => {
            if (idx === 0) return true;
            const prevEnd = consecutiveSlots[idx - 1].end;
            return slot.start.getTime() === prevEnd.getTime();
          });
          
          if (isConsecutive) {
            newSuggestions.push({
              id: `${activity.name}-${dayOffset}-${i}`,
              activityName: activity.name,
              start: consecutiveSlots[0].start,
              end: consecutiveSlots[consecutiveSlots.length - 1].end,
              duration: activity.duration,
              accepted: false
            });
            break;
          }
        }
      });
    });
    
    setSuggestions(newSuggestions);
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
    const acceptedSuggestions = suggestions.filter(s => s.accepted);
    
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
      
      await createCalendarEvent(event);
    }
    
    await loadCalendarEvents();
    setCurrentStep('complete');
    setLoading(false);
  };

  // Constant activity functions
  const addConstantActivity = () => {
    if (newConstantActivity.name.trim()) {
      setConstantActivities(prev => [...prev, {...newConstantActivity, id: Date.now()}]);
      setNewConstantActivity({
        name: '',
        startTime: '09:00',
        duration: 60,
        days: [1, 2, 3, 4, 5]
      });
    }
  };

  const removeConstantActivity = (id) => {
    setConstantActivities(prev => prev.filter(a => a.id !== id));
  };

  // Flexible activity functions
  const addFlexibleActivity = () => {
    if (newFlexibleActivity.name.trim()) {
      setFlexibleActivities(prev => [...prev, {...newFlexibleActivity, id: Date.now()}]);
      setNewFlexibleActivity({
        name: '',
        duration: 60,
        days: []
      });
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
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
        
        <button
          onClick={signIn}
          disabled={loading || !gapi}
          className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Connecting...' : 'Connect Google Calendar'}
        </button>
        
        <div className="mt-6 text-xs text-gray-500">
          <p>Note: You'll need to configure Google OAuth credentials for this to work.</p>
          <p>See setup instructions in the code comments.</p>
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
            <button onClick={signOut} className="text-gray-500 hover:text-gray-700">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Daily Time Window
              </label>
              <div className="flex space-x-4">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                  <input
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
                  <label className="block text-xs text-gray-500 mb-1">End Time</label>
                  <input
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scheduling Duration
              </label>
              <select
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
              onClick={() => setCurrentStep('constants')}
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
                        value={newConstantActivity.duration}
                        onChange={(e) => setNewConstantActivity(prev => ({...prev, duration: parseInt(e.target.value)}))}
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
                              : [...newConstantActivity.days, index];
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
                    onClick={addConstantActivity}
                    disabled={!newConstantActivity.name.trim()}
                    className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="inline h-4 w-4 mr-2" />
                    Add Activity
                  </button>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-4">Current Activities</h3>
                <div className="space-y-3">
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
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {constantActivities.length === 0 && (
                    <p className="text-gray-500 text-center py-8">No activities added yet</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setCurrentStep('setup')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep('flexible')}
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
                      value={newFlexibleActivity.duration}
                      onChange={(e) => setNewFlexibleActivity(prev => ({...prev, duration: parseInt(e.target.value)}))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  
                  <button
                    onClick={addFlexibleActivity}
                    disabled={!newFlexibleActivity.name.trim()}
                    className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="inline h-4 w-4 mr-2" />
                    Add Activity
                  </button>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-4">Flexible Activities</h3>
                <div className="space-y-3">
                  {flexibleActivities.map(activity => (
                    <div key={activity.id} className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-900">{activity.name}</h4>
                          <p className="text-sm text-gray-600">{activity.duration} minutes per session</p>
                        </div>
                        <button
                          onClick={() => removeFlexibleActivity(activity.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {flexibleActivities.length === 0 && (
                    <p className="text-gray-500 text-center py-8">No activities added yet</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setCurrentStep('constants')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => {
                  generateSuggestions();
                  setCurrentStep('suggestions');
                }}
                disabled={flexibleActivities.length === 0}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Generate Suggestions
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
          
          <div className="space-y-4">
            {suggestions.map(suggestion => (
              <div key={suggestion.id} className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-gray-900">{suggestion.activityName}</h4>
                    <p className="text-sm text-gray-600">
                      {suggestion.start.toLocaleDateString()} • {suggestion.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {suggestion.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                    <p className="text-sm text-gray-600">{suggestion.duration} minutes</p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => acceptSuggestion(suggestion.id)}
                      disabled={suggestion.accepted}
                      className={`p-2 rounded-lg transition-colors ${
                        suggestion.accepted
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-200 text-gray-600 hover:bg-green-100 hover:text-green-600'
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => rejectSuggestion(suggestion.id)}
                      className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {suggestions.length === 0 && (
              <p className="text-gray-500 text-center py-8">No suggestions available</p>
            )}
          </div>
          
          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setCurrentStep('flexible')}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={finalizeSchedule}
              disabled={suggestions.filter(s => s.accepted).length === 0 || loading}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Scheduling...' : 'Finalize Schedule'}
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
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Schedule Created Successfully!</h2>
            <p className="text-gray-600">Your activities have been added to your Google Calendar</p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <h3 className="font-medium text-gray-900 mb-2">Summary</h3>
            <p className="text-sm text-gray-600">
              Added {suggestions.filter(s => s.accepted).length} activities to your calendar
            </p>
          </div>
          
          <div className="flex space-x-4">
            <button
              onClick={() => {
                setCurrentStep('setup');
                setSuggestions([]);
                setConstantActivities([]);
                setFlexibleActivities([]);
              }}
              className="flex-1 px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Start Over
            </button>
            <button
              onClick={() => window.open('https://calendar.google.com', '_blank')}
              className="flex-1 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              View Calendar
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Main render logic
  if (!isAuthenticated) {
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