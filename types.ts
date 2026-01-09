
export interface UserData {
  id: string;
  firstName: string;
  balance: number;
  referrals: number;
  adsWatched: number;
  joinedAt: string;
  isBanned?: boolean;
  withdrawals?: Record<string, WithdrawalRequest>;
  completed_tasks?: Record<string, boolean>;
}

export interface WithdrawalRequest {
  userId: string;
  userName: string;
  amount: number;
  method: string;
  account: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
}

export interface WebTask {
  id: string;
  name: string;
  reward: number;
  url: string;
  icon?: string;
}

export interface AppConfig {
  currencySymbol: string;
  adReward: number;
  referralReward: number;
  supportLink: string;
  withdrawMethods: { name: string; min: number }[];
  webTasks?: Record<string, WebTask>;
}

export enum Tab {
  HOME = 'home',
  TASKS = 'tasks',
  ADS = 'ads',
  WITHDRAW = 'withdraw',
  REFERRAL = 'referral'
}
