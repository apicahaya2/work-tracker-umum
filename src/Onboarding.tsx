import React, { useState } from 'react';
import { Calendar, Key, Clock, CheckCircle } from 'lucide-react';

interface OnboardingProps {
  onComplete: (data: {
    gitAuthorName: string;
    icalUrl: string;
    jiraHost: string;
    jiraEmail: string;
    jiraToken: string;
    hasDailyMeeting: boolean;
    dailyMeetingTitle?: string;
    dailyMeetingTime?: string;
    dailyMeetingDuration?: number;
  }) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [gitAuthorName, setGitAuthorName] = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [jiraHost, setJiraHost] = useState('');
  const [jiraEmail, setJiraEmail] = useState('');
  const [jiraToken, setJiraToken] = useState('');
  const [hasDailyMeeting, setHasDailyMeeting] = useState(false);
  const [dailyMeetingTitle, setDailyMeetingTitle] = useState('Daily Standup');
  const [dailyMeetingTime, setDailyMeetingTime] = useState('09:30');
  const [dailyMeetingDuration, setDailyMeetingDuration] = useState('0.5');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      gitAuthorName,
      icalUrl,
      jiraHost,
      jiraEmail,
      jiraToken,
      hasDailyMeeting,
      dailyMeetingTitle: hasDailyMeeting ? dailyMeetingTitle : undefined,
      dailyMeetingTime: hasDailyMeeting ? dailyMeetingTime : undefined,
      dailyMeetingDuration: hasDailyMeeting ? parseFloat(dailyMeetingDuration) : undefined,
    });
  };

  return (
    <div style={{ maxWidth: '600px', margin: '60px auto', padding: '32px', backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px', color: 'var(--text-color)' }}>Welcome to Work Tracker</h1>
        <p style={{ color: 'var(--text-muted)' }}>Let's get your environment set up.</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Git Identity Section */}
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Key size={20} /> Identity (Required)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500' }}>Git Author Name</label>
            <input 
              type="text" 
              required
              value={gitAuthorName}
              onChange={e => setGitAuthorName(e.target.value)}
              placeholder="e.g. John Doe"
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
            />
            <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>This will filter the tracker to only show your commits (useful for team dashboards).</p>
          </div>
        </div>

        {/* Calendar Section */}
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Calendar size={20} /> Calendar Integration
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500' }}>ICS URL (optional)</label>
            <input 
              type="text" 
              value={icalUrl}
              onChange={e => setIcalUrl(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
            />
          </div>
        </div>

        {/* Jira Section */}
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Key size={20} /> Jira Integration (Optional)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Jira Host</label>
              <input 
                type="text" 
                value={jiraHost}
                onChange={e => setJiraHost(e.target.value)}
                placeholder="company.atlassian.net"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Jira Email</label>
              <input 
                type="email" 
                value={jiraEmail}
                onChange={e => setJiraEmail(e.target.value)}
                placeholder="you@company.com"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Jira API Token</label>
              <input 
                type="password" 
                value={jiraToken}
                onChange={e => setJiraToken(e.target.value)}
                placeholder="Your Jira API Token"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
              />
            </div>
          </div>
        </div>

        {/* Daily Meeting Section */}
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Clock size={20} /> Daily Meeting
          </h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '16px' }}>
            <input 
              type="checkbox" 
              checked={hasDailyMeeting}
              onChange={e => setHasDailyMeeting(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '15px' }}>I have a recurring daily meeting</span>
          </label>
          
          {hasDailyMeeting && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Meeting Title</label>
                <input 
                  type="text" 
                  value={dailyMeetingTitle}
                  onChange={e => setDailyMeetingTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--card-bg)', color: 'var(--text-color)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Time</label>
                  <input 
                    type="time" 
                    value={dailyMeetingTime}
                    onChange={e => setDailyMeetingTime(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--card-bg)', color: 'var(--text-color)' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Duration (hrs)</label>
                  <input 
                    type="number" 
                    step="0.25"
                    min="0"
                    value={dailyMeetingDuration}
                    onChange={e => setDailyMeetingDuration(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--card-bg)', color: 'var(--text-color)' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <button 
          type="submit" 
          style={{ 
            marginTop: '16px',
            padding: '14px', 
            borderRadius: '8px', 
            border: 'none', 
            backgroundColor: '#0891b2', 
            color: 'white', 
            fontSize: '16px', 
            fontWeight: '600', 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <CheckCircle size={20} />
          Complete Setup
        </button>
      </form>
    </div>
  );
}
