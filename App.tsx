
import React, { useState, useEffect } from 'react';
import { Tab, UserData, AppConfig, WebTask, WithdrawalRequest } from './types';

// Declare globals for Firebase and Telegram
declare global {
  interface Window {
    firebase: any;
    Telegram: any;
  }
}

const firebaseConfig = {
  apiKey: "AIzaSyCU3GOdYg8hcFRqtjumF62Wjr8RYYidhVo",
  authDomain: "tdsk-bd-bot.firebaseapp.com",
  databaseURL: "https://tdsk-bd-bot-default-rtdb.firebaseio.com",
  projectId: "tdsk-bd-bot",
  storageBucket: "tdsk-bd-bot.firebasestorage.app",
  messagingSenderId: "783565166092",
  appId: "1:783565166092:web:df0cf2be086ceddf2a0029",
  measurementId: "G-PNJJT80RTT"
};

if (!window.firebase.apps.length) {
  window.firebase.initializeApp(firebaseConfig);
}
const db = window.firebase.database();

const Toast: React.FC<{ message: string; type: 'success' | 'error' | 'warning'; onClose: () => void }> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgClass = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-yellow-500';
  
  return (
    <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-xl text-white shadow-2xl flex items-center gap-3 animate-bounce ${bgClass}`}>
      <i className={`fa-solid ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
      <span className="font-medium text-sm">{message}</span>
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [user, setUser] = useState<UserData | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' | 'warning' }[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [adTimer, setAdTimer] = useState<number | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>('');

  const tg = window.Telegram?.WebApp;
  const userId = tg?.initDataUnsafe?.user?.id?.toString() || "demo_user_123";
  const userName = tg?.initDataUnsafe?.user?.first_name || "Guest User";

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // 1. Live Config Sync (Admin Panel Settings)
  useEffect(() => {
    const configRef = db.ref('config');
    configRef.on('value', (snapshot: any) => {
      const data = snapshot.val();
      if (data) setConfig(data);
    });
    return () => configRef.off();
  }, []);

  // 2. Live User Sync (Balance, Status, Banned)
  useEffect(() => {
    if (!userId) return;
    const userRef = db.ref(`users/${userId}`);
    userRef.on('value', (snapshot: any) => {
      const data = snapshot.val();
      if (data) {
        if (data.isBanned) {
          alert("Your account has been suspended by the administrator.");
          tg?.close();
        }
        setUser(data);
      } else {
        // Auto-Register on first launch
        userRef.set({
          id: userId,
          firstName: userName,
          balance: 0,
          referrals: 0,
          adsWatched: 0,
          joinedAt: new Date().toISOString(),
          completed_tasks: {}
        });
      }
    });
    return () => userRef.off();
  }, [userId, userName]);

  // 3. Real-time Ad Reward Button
  const handleWatchAd = () => {
    if (adTimer !== null) return;
    setAdTimer(15);
    const interval = setInterval(() => {
      setAdTimer(prev => {
        if (prev !== null && prev <= 1) {
          clearInterval(interval);
          
          // Transactional update to prevent sync issues
          db.ref(`users/${userId}`).transaction((current: any) => {
            if (current) {
              const reward = config?.adReward || 0.5;
              current.balance = (current.balance || 0) + reward;
              current.adsWatched = (current.adsWatched || 0) + 1;
            }
            return current;
          });

          showToast(`Ad Bonus Claimed!`, 'success');
          return null;
        }
        return prev !== null ? prev - 1 : null;
      });
    }, 1000);
  };

  // 4. Real-time Task Claim Button
  const handleTaskClick = (task: WebTask) => {
    if (user?.completed_tasks?.[task.id]) return;
    window.open(task.url, '_blank');
    
    // Simulate verification (In a real app, use bot callbacks)
    setTimeout(() => {
      if (confirm(`Did you finish the task: ${task.name}?`)) {
        db.ref(`users/${userId}`).transaction((current: any) => {
          if (current) {
            if (!current.completed_tasks) current.completed_tasks = {};
            if (!current.completed_tasks[task.id]) {
              current.completed_tasks[task.id] = true;
              current.balance = (current.balance || 0) + (task.reward || 0);
            }
          }
          return current;
        });
        showToast('Task reward added!', 'success');
      }
    }, 2500);
  };

  // 5. Real-time Withdrawal Submit
  const handleWithdraw = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedMethod) return showToast('Select a method first');
    
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const account = formData.get('account') as string;
    const methodConfig = config?.withdrawMethods?.find(m => m.name === selectedMethod);
    const min = methodConfig?.min || 50;

    if (!user || amount > user.balance) return showToast('Insufficient Balance');
    if (amount < min) return showToast(`Minimum is ${config?.currencySymbol}${min}`);

    const withdrawalId = db.ref('withdrawals/pending').push().key;
    const request = {
      id: withdrawalId,
      userId,
      userName: user.firstName,
      amount,
      method: selectedMethod,
      account,
      status: 'pending',
      date: new Date().toISOString()
    };

    const updates: any = {};
    updates[`/withdrawals/pending/${withdrawalId}`] = request;
    updates[`/users/${userId}/balance`] = user.balance - amount;
    updates[`/users/${userId}/withdrawals/${withdrawalId}`] = request;

    db.ref().update(updates).then(() => {
      showToast('Request sent to Admin!', 'success');
      (e.target as HTMLFormElement).reset();
      setSelectedMethod('');
    });
  };

  return (
    <div className="min-h-screen pb-24 relative overflow-x-hidden bg-gray-50">
      {toasts.map(t => (
        <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
      ))}

      {adTimer !== null && (
        <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-white rounded-3xl p-8 text-center w-full max-w-xs shadow-2xl">
            <div className="w-20 h-20 border-4 border-indigo-600 border-t-transparent rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-indigo-600 animate-spin">
              <span className="animate-none">{adTimer}</span>
            </div>
            <h3 className="text-xl font-bold mb-2">Watching Ad</h3>
            <p className="text-gray-400 text-sm">Synchronizing with server...</p>
          </div>
        </div>
      )}

      {isSidebarOpen && (
        <div className="fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className={`fixed top-0 left-0 h-full w-72 bg-white z-[2001] transition-transform duration-300 shadow-2xl p-6 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-indigo-600 text-white rounded-full mx-auto mb-4 flex items-center justify-center text-3xl font-bold shadow-lg">
            {user?.firstName?.charAt(0) || '?'}
          </div>
          <h3 className="font-bold text-lg">{user?.firstName || 'User'}</h3>
          <p className="text-gray-400 text-xs">ID: {user?.id}</p>
        </div>
        <nav className="space-y-2">
          <button onClick={() => { setActiveTab(Tab.HOME); setIsSidebarOpen(false); }} className="w-full text-left p-4 rounded-2xl hover:bg-indigo-50 flex items-center gap-3 transition-all font-medium">
            <i className="fa-solid fa-house text-indigo-600"></i> Dashboard
          </button>
          <button onClick={() => { setActiveTab(Tab.WITHDRAW); setIsSidebarOpen(false); }} className="w-full text-left p-4 rounded-2xl hover:bg-indigo-50 flex items-center gap-3 transition-all font-medium">
            <i className="fa-solid fa-clock-rotate-left text-indigo-600"></i> Withdraw History
          </button>
          <a href={config?.supportLink} target="_blank" className="w-full text-left p-4 rounded-2xl hover:bg-indigo-50 flex items-center gap-3 transition-all font-medium no-underline text-gray-800">
            <i className="fa-solid fa-headset text-indigo-600"></i> Admin Support
          </a>
        </nav>
      </div>

      <header className="bg-gradient-to-br from-indigo-700 to-indigo-500 text-white pt-10 pb-16 px-6 rounded-b-[50px] shadow-xl relative z-10">
        <div className="flex justify-between items-center mb-8">
          <button onClick={() => setIsSidebarOpen(true)} className="w-12 h-12 flex items-center justify-center bg-white/20 rounded-2xl hover:bg-white/30 transition-all backdrop-blur-md">
            <i className="fa-solid fa-bars-staggered text-xl"></i>
          </button>
          <div className="flex items-center gap-3">
             <div className="text-right">
                <p className="text-[10px] uppercase font-bold tracking-widest opacity-70">Balance</p>
                <h4 className="font-bold">{config?.currencySymbol || '৳'}{user?.balance?.toFixed(2) || '0.00'}</h4>
             </div>
             <div className="w-10 h-10 rounded-full bg-white/20 p-0.5"><img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`} className="rounded-full" /></div>
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-xl rounded-[35px] p-8 border border-white/20 shadow-2xl text-center">
            <p className="text-xs uppercase font-bold tracking-[0.2em] opacity-80 mb-2">Total Earnings</p>
            <h1 className="text-5xl font-black">{config?.currencySymbol || '৳'}{user?.balance?.toFixed(2)}</h1>
        </div>
      </header>

      <main className="px-6 -mt-10 relative z-20 space-y-6">
        {activeTab === Tab.HOME && (
          <div className="section-enter space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-[30px] shadow-sm border border-gray-100">
                <div className="w-10 h-10 bg-green-50 text-green-500 rounded-xl flex items-center justify-center mb-3">
                   <i className="fa-solid fa-wallet"></i>
                </div>
                <p className="text-xs text-gray-400 font-medium">Income</p>
                <h3 className="font-bold text-xl">{config?.currencySymbol}{user?.balance?.toFixed(2)}</h3>
              </div>
              <div className="bg-white p-5 rounded-[30px] shadow-sm border border-gray-100">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center mb-3">
                   <i className="fa-solid fa-users"></i>
                </div>
                <p className="text-xs text-gray-400 font-medium">Invites</p>
                <h3 className="font-bold text-xl">{user?.referrals || 0}</h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[35px] shadow-sm border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center text-2xl shadow-inner">
                  <i className="fa-solid fa-video"></i>
                </div>
                <div>
                  <h4 className="font-bold">Ads Watched</h4>
                  <p className="text-xs text-gray-400">Syncing with Admin...</p>
                </div>
              </div>
              <span className="text-2xl font-black text-indigo-600">{user?.adsWatched || 0}</span>
            </div>

            <button 
              onClick={() => setActiveTab(Tab.TASKS)}
              className="w-full bg-indigo-600 text-white p-6 rounded-[35px] shadow-xl shadow-indigo-200 flex items-center justify-between active:scale-95 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-xl">
                  <i className="fa-solid fa-list-check"></i>
                </div>
                <div className="text-left">
                  <h4 className="font-bold">Start Tasks</h4>
                  <p className="text-xs opacity-70">Click to see web tasks</p>
                </div>
              </div>
              <i className="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        )}

        {activeTab === Tab.TASKS && (
          <div className="section-enter space-y-4">
            <h3 className="text-xl font-bold ml-2">Available Tasks</h3>
            {config?.webTasks ? (
                Object.values(config.webTasks).map((task: any) => (
                <div key={task.id} className="bg-white p-5 rounded-[30px] shadow-sm border border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <img src={task.icon || 'https://via.placeholder.com/50'} className="w-12 h-12 rounded-2xl object-cover shadow-sm" />
                        <div>
                            <h5 className="font-bold text-sm">{task.name}</h5>
                            <p className="text-xs text-green-600 font-bold">+{config?.currencySymbol}{task.reward?.toFixed(2)}</p>
                        </div>
                    </div>
                    <button 
                        disabled={user?.completed_tasks?.[task.id]}
                        onClick={() => handleTaskClick(task)}
                        className={`px-6 py-2.5 rounded-2xl text-xs font-bold transition-all ${user?.completed_tasks?.[task.id] ? 'bg-gray-100 text-gray-400' : 'bg-indigo-600 text-white active:scale-90 shadow-lg shadow-indigo-100'}`}
                    >
                        {user?.completed_tasks?.[task.id] ? 'Claimed' : 'Visit'}
                    </button>
                </div>
                ))
            ) : (
                <div className="text-center py-20 text-gray-400 font-medium">No active tasks from Admin</div>
            )}
          </div>
        )}

        {activeTab === Tab.ADS && (
          <div className="section-enter py-10 text-center bg-white rounded-[50px] shadow-sm border border-gray-100 p-10 space-y-8">
            <div className="w-28 h-28 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-6xl mx-auto shadow-inner relative">
              <i className="fa-solid fa-play"></i>
              <div className="absolute -top-2 -right-2 bg-pink-500 text-white text-[10px] px-3 py-1 rounded-full font-bold animate-pulse">LIVE</div>
            </div>
            <div>
              <h3 className="text-3xl font-black mb-2">Ad Reward</h3>
              <p className="text-gray-400 text-sm">Real-time Admin payout enabled</p>
              <p className="text-indigo-600 font-black mt-4 text-3xl">+{config?.currencySymbol}{config?.adReward || '0.50'}</p>
            </div>
            <button 
              onClick={handleWatchAd}
              disabled={adTimer !== null}
              className={`w-full bg-gradient-to-r from-indigo-600 to-indigo-400 text-white py-6 rounded-[30px] font-bold text-lg shadow-2xl shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-3 ${adTimer !== null ? 'opacity-50' : ''}`}
            >
              <i className="fa-solid fa-bolt"></i>
              Show Reward Ad
            </button>
          </div>
        )}

        {activeTab === Tab.WITHDRAW && (
          <div className="section-enter space-y-6">
            <h3 className="text-xl font-bold ml-2">Withdrawal Desk</h3>
            <form onSubmit={handleWithdraw} className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 space-y-6">
              <div className="space-y-3">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Payment Channel</label>
                <div className="grid grid-cols-3 gap-3">
                  {config?.withdrawMethods?.map(m => (
                    <button 
                      type="button" 
                      key={m.name} 
                      onClick={() => setSelectedMethod(m.name)}
                      className={`py-4 border-2 rounded-2xl text-xs font-black transition-all ${selectedMethod === m.name ? 'border-indigo-600 text-indigo-600 bg-indigo-50 shadow-inner' : 'border-gray-50 text-gray-300 bg-gray-50'}`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Recipient Account</label>
                <input required type="text" name="account" placeholder="Enter number / ID" className="w-full bg-gray-50 border-none rounded-2xl p-5 focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-indigo-900" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Amount</label>
                <input required type="number" name="amount" placeholder="Minimum 50" className="w-full bg-gray-50 border-none rounded-2xl p-5 focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-indigo-900" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-6 rounded-[30px] font-bold shadow-2xl shadow-indigo-100 active:scale-95 transition-all mt-4">
                Confirm Request
              </button>
            </form>
            
            {user?.withdrawals && (
                <div className="space-y-4">
                    <h4 className="font-bold text-gray-500 text-sm ml-2">LIVE STATUS</h4>
                    {Object.values(user.withdrawals).reverse().map((w: any, idx) => (
                        <div key={idx} className="bg-white p-5 rounded-[30px] flex items-center justify-between border border-gray-100 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                            <div>
                                <p className="font-bold">{w.method}</p>
                                <p className="text-[10px] text-gray-400 font-mono uppercase tracking-tighter">{new Date(w.date).toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-black text-indigo-600">{config?.currencySymbol}{w.amount}</p>
                                <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase ${w.status === 'pending' ? 'bg-amber-100 text-amber-600' : w.status === 'completed' || w.status === 'approved' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                    {w.status}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
        )}

        {activeTab === Tab.REFERRAL && (
          <div className="section-enter text-center space-y-8">
            <div className="relative inline-block">
                <img src={`https://api.dicebear.com/7.x/big-smile/svg?seed=${userId}`} alt="Avatar" className="w-44 h-44 mx-auto rounded-full border-8 border-white shadow-2xl bg-white" />
                <div className="absolute top-0 right-0 bg-indigo-600 text-white px-4 py-1.5 rounded-full font-bold shadow-lg text-xs animate-bounce">TOP USER</div>
            </div>
            <div className="bg-white p-10 rounded-[50px] shadow-sm border border-gray-100 space-y-8">
              <div>
                <h3 className="text-3xl font-black mb-2">Referral Program</h3>
                <p className="text-gray-400 text-sm">Earn <span className="text-indigo-600 font-bold">{config?.currencySymbol}{config?.referralReward || config?.referralBonus || '2.00'}</span> for every invite!</p>
              </div>
              <div className="bg-indigo-50 p-6 rounded-3xl border-2 border-dashed border-indigo-200 text-xs font-mono text-indigo-600 select-all cursor-pointer hover:bg-indigo-100 transition-all">
                https://t.me/{config?.botUsername || 'ProfitMaster'}_bot?start={user?.id}
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => {
                        const link = `https://t.me/${config?.botUsername || 'ProfitMaster'}_bot?start=${user?.id}`;
                        window.open(`https://wa.me/?text=${encodeURIComponent("Hey! Join this real earning app and get a bonus: " + link)}`, '_blank');
                    }}
                    className="bg-[#25D366] text-white py-5 rounded-[25px] font-bold shadow-lg shadow-green-100 active:scale-95 transition-all text-sm flex items-center justify-center gap-2"
                  >
                    <i className="fa-brands fa-whatsapp text-lg"></i> WhatsApp
                  </button>
                  <button 
                    onClick={() => {
                        navigator.clipboard.writeText(`https://t.me/${config?.botUsername || 'ProfitMaster'}_bot?start=${user?.id}`);
                        showToast('Link Copied!', 'success');
                    }}
                    className="bg-indigo-600 text-white py-5 rounded-[25px] font-bold shadow-lg shadow-indigo-100 active:scale-95 transition-all text-sm flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-copy text-lg"></i> Copy
                  </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-gray-100 px-6 py-5 flex justify-between items-center z-[1000] rounded-t-[45px] shadow-[0_-15px_40px_rgba(0,0,0,0.08)]">
        <NavItem active={activeTab === Tab.HOME} icon="fa-house" label="Home" onClick={() => setActiveTab(Tab.HOME)} />
        <NavItem active={activeTab === Tab.TASKS} icon="fa-layer-group" label="Tasks" onClick={() => setActiveTab(Tab.TASKS)} />
        <NavItem active={activeTab === Tab.ADS} icon="fa-circle-play" label="Reward" onClick={() => setActiveTab(Tab.ADS)} />
        <NavItem active={activeTab === Tab.WITHDRAW} icon="fa-wallet" label="Cashout" onClick={() => setActiveTab(Tab.WITHDRAW)} />
        <NavItem active={activeTab === Tab.REFERRAL} icon="fa-paper-plane" label="Refer" onClick={() => setActiveTab(Tab.REFERRAL)} />
      </nav>
    </div>
  );
};

const NavItem: React.FC<{ active: boolean; icon: string; label: string; onClick: () => void }> = ({ active, icon, label, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center gap-1.5 transition-all duration-500 relative ${active ? 'text-indigo-600 -translate-y-3' : 'text-gray-300'}`}
  >
    <div className={`w-12 h-12 rounded-[20px] flex items-center justify-center text-xl transition-all ${active ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-300' : 'bg-transparent'}`}>
      <i className={`fa-solid ${icon}`}></i>
    </div>
    <span className={`text-[9px] font-black uppercase tracking-widest ${active ? 'opacity-100' : 'opacity-0 scale-50'}`}>{label}</span>
    {active && <div className="absolute -bottom-2 w-1.5 h-1.5 bg-indigo-600 rounded-full animate-ping"></div>}
  </button>
);

export default App;
