import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Camera, 
  LayoutDashboard, 
  CheckSquare, 
  Settings, 
  LogOut, 
  Upload, 
  MapPin, 
  Clock, 
  User,
  Plus,
  Loader2,
  X,
  ChevronRight,
  TrendingUp,
  Briefcase
} from 'lucide-react';
import { format, addHours, startOfHour, isSameDay, parseISO, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';
import { cn } from './lib/utils';
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut,
  GoogleAuthProvider,
  type User as FirebaseUser
} from 'firebase/auth';
import { auth, googleProvider } from './lib/firebase';
import { extractEventsFromImage } from './lib/gemini';
import { createCalendarEvent, listCalendarEvents, type CalendarEvent } from './lib/calendar';

// --- Types ---
interface ExtractedEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime?: string;
  location?: string;
  description?: string;
}

interface UserProfile {
  name: string;
  email: string;
  picture: string;
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) => (
  <button 
    onClick={onClick}
    className={cn(
      "p-3 rounded-xl transition-all duration-300 group relative",
      active ? "bg-purple-600/20 text-purple-400" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/40"
    )}
  >
    <Icon size={22} />
    <span className="absolute left-16 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
      {label}
    </span>
  </button>
);

const EventCard = ({ event, category, currentTime }: { event: any, category: string, currentTime: Date }) => {
  const categories = {
    orange: "bg-orange-600/10 border-orange-500/30 text-orange-200",
    blue: "bg-blue-600/10 border-blue-500/30 text-blue-200",
    purple: "bg-purple-600/10 border-purple-500/30 text-purple-200",
    green: "bg-emerald-600/10 border-green-500/30 text-emerald-200",
  };

  const startTime = parseISO(event.start.dateTime || event.start.date);
  const endTime = parseISO(event.end.dateTime || event.end.date);

  const isHappeningNow = currentTime >= startTime && currentTime <= endTime;
  const minutesLeft = differenceInMinutes(endTime, currentTime);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "p-4 rounded-2xl border flex flex-col justify-between h-full backdrop-blur-md",
        categories[category as keyof typeof categories] || categories.blue
      )}
    >
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-bold text-lg leading-tight">{event.summary}</h4>
          <p className="text-xs font-medium opacity-60 mt-1">
            {format(startTime, 'h a')} &gt; {format(endTime, 'h:mm a')}
          </p>
        </div>
        {isHappeningNow && minutesLeft > 0 && (
          <div className="bg-white/10 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider animate-pulse">
            Left {minutesLeft}m
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-between mt-4">
        <div className="flex -space-x-2">
          {[1, 2].map((i) => (
            <div key={i} className="w-6 h-6 rounded-full border-2 border-[#050505] overflow-hidden">
              <img src={`https://i.pravatar.cc/100?u=${event.id}${i}`} alt="avatar" />
            </div>
          ))}
        </div>
        {event.location && (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest opacity-60">
            <MapPin size={10} />
            {event.location}
          </span>
        )}
      </div>
    </motion.div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ base64: string, type: string } | null>(null);
  const [extractedEvents, setExtractedEvents] = useState<ExtractedEvent[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<any[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time indicator
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Auth Handling
  const handleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      
      if (token) {
        setAccessToken(token);
        const user = result.user;
        setUserProfile({
          name: user.displayName || '',
          email: user.email || '',
          picture: user.photoURL || ''
        });
        setNotification({ message: `Welcome ${user.displayName}!`, type: 'success' });
        setTimeout(() => setNotification(null), 3000);
      }
    } catch (error: any) {
      console.error("Sign-in failed:", error);
      setNotification({ message: "Sign-in failed. Please try again.", type: 'error' });
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setAccessToken(null);
      setUserProfile(null);
      setEvents([]);
      setNotification({ message: "Signed out successfully", type: 'success' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error("Sign-out failed:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: FirebaseUser | null) => {
      if (user) {
        setUserProfile({
          name: user.displayName || '',
          email: user.email || '',
          picture: user.photoURL || ''
        });
      } else {
        setUserProfile(null);
        setAccessToken(null);
        setEvents([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch Events
  useEffect(() => {
    if (accessToken) {
      listCalendarEvents(accessToken).then(setEvents).catch(err => {
        console.error("Failed to list events:", err);
        setAccessToken(null);
        setNotification({ message: "Session expired. Please reconnect calendar.", type: 'error' });
      });
    }
  }, [accessToken]);

  // Image Handling
  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setPreviewImage({ base64, type: file.type });
    };
    reader.readAsDataURL(file);
  };

  const processImage = async () => {
    if (!previewImage) return;
    setIsProcessing(true);
    try {
      const data = await extractEventsFromImage(previewImage.base64, previewImage.type);
      setExtractedEvents(data);
      setSelectedEventIds(new Set(data.map((e: any) => e.id)));
      setIsProcessing(false);
      setPreviewImage(null);
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      setPreviewImage(null);
    }
  };

  const handleManualAdd = () => {
    const newEvent: ExtractedEvent = {
       id: Math.random().toString(36).substr(2, 9),
       title: '',
       date: format(new Date(), 'yyyy-MM-dd'),
       startTime: format(new Date(), 'HH:mm'),
       endTime: format(addHours(new Date(), 1), 'HH:mm')
    };
    setExtractedEvents([newEvent]);
    setSelectedEventIds(new Set([newEvent.id]));
    setIsManualEntry(true);
    setIsScannerOpen(true);
  };

  const confirmSelectedEvents = async () => {
    if (!accessToken || extractedEvents.length === 0) return;
    
    setIsProcessing(true);
    try {
      const selectedEvents = extractedEvents.filter(e => selectedEventIds.has(e.id));
      
      for (const extractedEvent of selectedEvents) {
        // Construct local date-time strings
        // We use the browser's local timezone for the student's convenience
        const startDateTime = new Date(`${extractedEvent.date}T${extractedEvent.startTime}:00`).toISOString();
        const endDateTime = extractedEvent.endTime 
          ? new Date(`${extractedEvent.date}T${extractedEvent.endTime}:00`).toISOString()
          : addHours(parseISO(startDateTime), 1).toISOString();

        const event: CalendarEvent = {
          summary: extractedEvent.title,
          location: extractedEvent.location,
          description: extractedEvent.description,
          start: { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          end: { dateTime: endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        };

        await createCalendarEvent(accessToken, event);
      }
      
      setNotification({ message: `Successfully added ${selectedEvents.length} events to your calendar`, type: 'success' });
      
      setExtractedEvents([]);
      setSelectedEventIds(new Set());
      setIsScannerOpen(false);
      setIsManualEntry(false);
      setIsProcessing(false);
      
      // Refresh events
      const updatedEvents = await listCalendarEvents(accessToken);
      setEvents(updatedEvents);

      // Clear notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      console.error(err);
      setNotification({ message: "Failed to add events. Please ensure your calendar is connected.", type: 'error' });
      setIsProcessing(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const toggleEventSelection = (id: string) => {
    const next = new Set(selectedEventIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEventIds(next);
  };

  const updateExtractedEvent = (id: string, updates: Partial<ExtractedEvent>) => {
    setExtractedEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  return (
    <div className="flex h-screen bg-brand-bg text-[#e0e0e0] overflow-hidden font-sans select-none antialiased">
      {/* Sidebar - Navigation Rail */}
      <aside className="w-20 border-r border-brand-border bg-brand-sidebar flex flex-col items-center py-8 shrink-0">
        <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center mb-12 shadow-lg shadow-purple-500/20">
          <span className="font-bold text-white text-xl">P</span>
        </div>
        
        <nav className="flex-1 flex flex-col gap-8">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarItem icon={Plus} label="Manual Entry" onClick={handleManualAdd} />
          <SidebarItem icon={TrendingUp} label="Projects" active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} />
          <SidebarItem icon={CheckSquare} label="Tasks" active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} />
          <SidebarItem icon={Camera} label="Scanner" active={activeTab === 'scanner'} onClick={() => { setIsManualEntry(false); setIsScannerOpen(true); }} />
        </nav>

        <div className="flex flex-col gap-8">
          <SidebarItem icon={Settings} label="Settings" />
          {userProfile ? (
            <button className="w-10 h-10 rounded-full overflow-hidden border border-white/20 group relative" onClick={handleSignOut}>
              <img src={userProfile.picture} alt="Profile" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <LogOut size={16} className="text-white" />
              </div>
            </button>
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-400 to-purple-500 border border-white/20 cursor-pointer" onClick={handleSignIn}></div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Notifications */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              className={cn(
                "fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full font-bold text-sm shadow-2xl flex items-center gap-3",
                notification.type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
              )}
            >
              {notification.type === 'success' ? <CheckSquare size={18} /> : <X size={18} />}
              {notification.message}
              {notification.type === 'error' && (
                <button 
                  onClick={handleSignIn}
                  className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-xs transition-colors"
                >
                  Reconnect
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header Section */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-brand-header">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Plan your week</h1>
            <span className="text-gray-500 bg-white/5 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest">
              Week {format(new Date(), 'w')}
            </span>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsScannerOpen(true)}
              className="flex items-center gap-2 bg-white text-black px-5 py-2.5 rounded-full text-sm font-bold shadow-xl hover:bg-gray-200 transition-all cursor-pointer"
            >
              <Camera size={18} />
              Smart Scan
            </button>
            {!accessToken ? (
              <button 
                onClick={handleSignIn}
                className="flex items-center gap-2 border border-white/20 bg-white/5 px-5 py-2.5 rounded-full text-sm font-medium hover:bg-white/10 transition-all text-white cursor-pointer"
              >
                <Plus size={18} />
                Connect Calendar
              </button>
            ) : (
              <a 
                href="https://calendar.google.com/calendar"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 border border-white/20 bg-white/5 px-5 py-2.5 rounded-full text-sm font-medium hover:bg-white/10 transition-all text-white cursor-pointer"
              >
                <Calendar size={18} />
                Go to Calendar
              </a>
            )}
          </div>
        </header>

        {/* Timeline View */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 relative overflow-y-auto scrollbar-hide bg-brand-bg border-r border-white/5">
            <div className="relative min-h-[1440px] px-6 py-4">
              {/* Time Grid Labels */}
              <div className="absolute left-0 top-0 bottom-0 w-20 flex flex-col text-[10px] text-gray-500 font-mono items-center py-4 gap-12 pointer-events-none">
                {Array.from({ length: 24 }).map((_, i) => (
                  <span key={i} style={{ position: 'absolute', top: `${i * 60 + 4}px` }}>
                    {format(startOfDay(new Date()).setHours(i), 'HH:mm')}
                  </span>
                ))}
              </div>

              {/* Grid Lines */}
              <div className="absolute left-20 right-0 top-0 bottom-0 pointer-events-none">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} className="absolute w-full h-[1px] bg-white/5" style={{ top: `${i * 60}px` }}></div>
                ))}
              </div>

              {/* Current Time Indicator */}
              <div 
                className="absolute left-10 right-0 z-20 flex items-center pointer-events-none transition-all duration-300"
                style={{ top: `${differenceInMinutes(currentTime, startOfDay(currentTime))}px` }}
              >
                <div className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-[0_0_15px_rgba(147,51,234,0.6)]">
                  {format(currentTime, 'h:mm a')}
                </div>
                <div className="h-[1px] flex-1 bg-purple-500 shadow-[0_0_8px_rgba(147,51,234,0.8)] ml-2"></div>
              </div>

              {/* Events Overlay */}
              <div className="absolute top-0 left-20 right-0 h-full pointer-events-none p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 h-full relative">
                  <AnimatePresence>
                    {events.map((event, idx) => {
                      const startTime = parseISO(event.start.dateTime || event.start.date);
                      const startMins = differenceInMinutes(startTime, startOfDay(startTime));
                      const duration = differenceInMinutes(
                        parseISO(event.end.dateTime || event.end.date), 
                        startTime
                      );
                      
                      return (
                        <div 
                          key={event.id}
                          className="absolute pointer-events-auto transition-all"
                          style={{ 
                            top: `${startMins}px`,
                            height: `${Math.max(duration, 60)}px`,
                            width: 'calc(100% / 3 - 24px)',
                            left: `calc(${(idx % 3) * 33.3}% + 12px)`
                          }}
                        >
                          <EventCard 
                            event={event} 
                            category={['orange', 'blue', 'purple', 'green'][idx % 4]} 
                            currentTime={currentTime}
                          />
                        </div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          {/* Right Tasks Sidebar */}
          <aside className="w-80 bg-brand-sidebar p-6 flex flex-col gap-8 shrink-0">
            <section>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Up Next</h4>
                <span className="bg-orange-500/20 text-orange-400 text-[10px] px-2 py-0.5 rounded font-bold uppercase">2 New</span>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { title: 'Calculus Assignment', category: 'purple', time: 'Due in 4 hours' },
                  { title: 'Lab Report Proof', category: 'orange', time: 'Due tomorrow' },
                ].map((task, i) => (
                  <div key={i} className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-center gap-4 cursor-pointer hover:border-white/20 transition-all group">
                    <div className={cn("w-1 h-8 rounded-full", {
                      'bg-purple-500': task.category === 'purple',
                      'bg-orange-500': task.category === 'orange',
                    })} />
                    <div>
                      <p className="text-sm font-semibold">{task.title}</p>
                      <p className="text-[10px] text-gray-500">{task.time}</p>
                    </div>
                    <CheckSquare size={16} className="ml-auto text-gray-700 group-hover:text-green-500" />
                  </div>
                ))}
              </div>
            </section>

            <section className="flex-1">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Projects</h4>
                <button className="text-[10px] text-purple-400 hover:underline">View All</button>
              </div>
              <div className="space-y-4">
                {[
                  { title: 'Spring Semester', progress: 65, color: 'purple' },
                  { title: 'AI Research', progress: 40, color: 'blue' },
                ].map((project, i) => (
                  <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <div className="flex justify-between text-xs font-bold mb-2">
                      <span>{project.title}</span>
                      <span className="text-gray-500">{project.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full bg-purple-500")} 
                        style={{ width: `${project.progress}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-auto p-4 bg-purple-600/10 border border-purple-500/20 rounded-2xl">
              <p className="text-xs font-bold text-purple-300 mb-1">Pro Tip</p>
              <p className="text-[11px] text-purple-200/70 leading-relaxed italic">
                Connect your Google Calendar for seamless university scheduling.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* Scanner & Confirmation Modal */}
      <AnimatePresence>
        {isScannerOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/60 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#0f0f12] border border-white/10 w-full max-w-xl rounded-[32px] shadow-2xl flex flex-col max-h-[90vh] relative overflow-hidden"
            >
              <div className="p-5 md:p-8 border-b border-white/5 flex justify-between items-center bg-[#0f0f12] shrink-0 relative">
                <div className="pr-12 md:pr-0">
                  <h3 className="text-xl md:text-2xl font-bold tracking-tight">Smart Picture Reader</h3>
                  <p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-widest font-bold">Capture syllabus or course flyers</p>
                </div>
                <button 
                  onClick={() => { setIsScannerOpen(false); setPreviewImage(null); setExtractedEvents([]); }} 
                  className="absolute top-4 right-4 md:relative md:top-0 md:right-0 p-3 md:p-2 bg-white/5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors z-10 flex items-center justify-center min-w-[44px] min-h-[44px]"
                >
                  <X size={24} className="md:size-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-hide p-4 md:p-8">
                {isProcessing ? (
                  <div className="py-16 flex flex-col items-center gap-6">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Camera size={24} className="text-purple-400" />
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">Analysing Syllabus</p>
                      <p className="text-sm text-gray-500">Gemini AI is extracting events...</p>
                    </div>
                  </div>
                ) : previewImage ? (
                  <div className="flex flex-col gap-6">
                    <div className="w-full aspect-video rounded-3xl overflow-hidden border border-white/10 relative shadow-2xl">
                      <img 
                        src={`data:image/${previewImage.type};base64,${previewImage.base64}`} 
                        alt="Scanned preview" 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    </div>
                    <div className="flex gap-2">
                       <button 
                         onClick={() => setPreviewImage(null)}
                         className="flex-1 py-2 md:py-2.5 bg-white/5 border border-white/10 rounded-full font-bold text-[10px] md:text-xs text-gray-400 hover:bg-white/10 transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                       >
                          <LogOut size={14} className="rotate-180" />
                          Retake
                       </button>
                       <button 
                         onClick={processImage}
                         className="flex-1 py-2 md:py-2.5 bg-purple-600 rounded-full font-bold text-[10px] md:text-xs text-white shadow-lg shadow-purple-600/20 hover:bg-purple-500 transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                       >
                          <CheckSquare size={14} />
                          Use Photo
                       </button>
                    </div>
                  </div>
                ) : !extractedEvents.length ? (
                  <div className="flex flex-col gap-6">
                    <div className="w-full aspect-[16/10] border-2 border-dashed border-white/10 rounded-[32px] flex flex-col items-center justify-center gap-4 bg-white/5 hover:bg-white/10 transition-all cursor-pointer relative group">
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        onChange={handleImageCapture}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      />
                      <div className="w-12 h-12 rounded-full bg-purple-600/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Camera size={24} className="text-purple-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm md:text-base font-bold">Open Camera / Upload</p>
                        <p className="text-[10px] md:text-xs text-gray-500 px-4">Capture syllabus, course flyers or schedule photos</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 p-3 bg-purple-600/10 border border-purple-500/20 rounded-2xl mb-1">
                       <div className="w-8 h-8 bg-purple-600 rounded-xl flex items-center justify-center text-white shrink-0">
                         <Calendar size={16} />
                       </div>
                       <div>
                         <h4 className="font-bold text-white text-sm md:text-base leading-none">{isManualEntry ? 'New Event' : 'Proposed Events'}</h4>
                         <p className="text-[9px] text-purple-300 uppercase tracking-widest font-bold mt-1">
                           {isManualEntry ? 'Manual Entry' : `Found ${extractedEvents.length} events`}
                         </p>
                       </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 md:gap-3">
                      {extractedEvents.map((event) => (
                        <div 
                          key={event.id} 
                          className={cn(
                            "bg-white/5 border rounded-2xl p-3 md:p-4 transition-all",
                            selectedEventIds.has(event.id) ? "border-purple-500/50 shadow-lg shadow-purple-500/10" : "border-white/10 opacity-60"
                          )}
                        >
                          <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
                            <input 
                              type="checkbox" 
                              checked={selectedEventIds.has(event.id)}
                              onChange={() => toggleEventSelection(event.id)}
                              className="w-4 h-4 md:w-5 md:h-5 rounded accent-purple-600 cursor-pointer"
                            />
                            <input 
                              value={event.title} 
                              placeholder="Event Title"
                              onChange={e => updateExtractedEvent(event.id, { title: e.target.value })}
                              className="flex-1 bg-transparent border-none text-white font-bold text-sm md:text-base focus:ring-0 p-0"
                            />
                            <div className="w-5 h-5 md:w-6 md:h-6 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                              <Briefcase size={10} className="md:size-3" />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-x-2 md:gap-x-4 gap-y-2">
                            <div className="flex items-center gap-1.5 md:gap-2">
                              <Calendar size={12} className="text-gray-500 shrink-0" />
                              <input 
                                type="date"
                                value={event.date} 
                                onChange={e => updateExtractedEvent(event.id, { date: e.target.value })}
                                className="bg-transparent border-none text-[10px] md:text-xs text-gray-300 focus:ring-0 p-0 w-full"
                              />
                            </div>
                            <div className="flex items-center gap-1.5 md:gap-2">
                              <MapPin size={12} className="text-gray-500 shrink-0" />
                              <input 
                                value={event.location || ''} 
                                placeholder="Location"
                                onChange={e => updateExtractedEvent(event.id, { location: e.target.value })}
                                className="bg-transparent border-none text-[10px] md:text-xs text-gray-300 focus:ring-0 p-0 w-full"
                              />
                            </div>
                            <div className="flex items-center gap-1.5 md:gap-2">
                              <Clock size={12} className="text-gray-500 shrink-0" />
                              <div className="flex items-center gap-1">
                                <input 
                                  type="time"
                                  value={event.startTime} 
                                  onChange={e => updateExtractedEvent(event.id, { startTime: e.target.value })}
                                  className="bg-transparent border-none text-[10px] md:text-xs text-gray-300 focus:ring-0 p-0"
                                />
                                <span className="text-[9px] text-gray-600">&gt;</span>
                                <input 
                                  type="time"
                                  value={event.endTime || ''} 
                                  onChange={e => updateExtractedEvent(event.id, { endTime: e.target.value })}
                                  className="bg-transparent border-none text-[10px] md:text-xs text-gray-300 focus:ring-0 p-0"
                                />
                              </div>
                            </div>
                            {event.startTime && event.endTime && (
                              <div className="flex items-center justify-end">
                                <span className="text-[9px] md:text-[10px] font-bold text-purple-400 uppercase tracking-widest">
                                  {Math.floor(differenceInMinutes(
                                    parseISO(`2000-01-01T${event.endTime}:00`),
                                    parseISO(`2000-01-01T${event.startTime}:00`)
                                  ) / 60)}h {Math.max(0, differenceInMinutes(
                                    parseISO(`2000-01-01T${event.endTime}:00`),
                                    parseISO(`2000-01-01T${event.startTime}:00`)
                                  ) % 60)}m
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-3 mt-4 pt-4 border-t border-white/5 sticky bottom-0 bg-[#0f0f12]">
                      <button 
                        onClick={() => { setExtractedEvents([]); setSelectedEventIds(new Set()); setIsManualEntry(false); }}
                        className="flex-1 py-2 md:py-2.5 bg-white/5 border border-white/10 rounded-full font-bold text-[10px] md:text-xs text-gray-400 hover:bg-white/10 transition-all uppercase tracking-widest"
                      >
                        Discard
                      </button>
                      <button 
                        disabled={selectedEventIds.size === 0 || isProcessing}
                        onClick={confirmSelectedEvents}
                        className={cn(
                          "flex-1 py-2 md:py-2.5 rounded-full font-bold text-[10px] md:text-xs text-white shadow-xl transition-all flex items-center justify-center gap-2 uppercase tracking-widest",
                          selectedEventIds.size > 0 ? "bg-purple-600 shadow-purple-600/20 hover:bg-purple-500" : "bg-gray-800 text-gray-500 cursor-not-allowed"
                        )}
                      >
                         {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                         {isManualEntry ? 'Add Event' : `Add ${selectedEventIds.size}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
