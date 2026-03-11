import StreakCalendar from './StreakCalendar'

export default function StreakPage({ members, data, tasks }) {
  return (
    <div>
      {members.map(member => (
        <div key={member.id} style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: 16, fontWeight: 700, padding: '8px 4px 4px',
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            <span>{member.emoji}</span>
            <span>{member.name}</span>
          </div>
          <StreakCalendar memberId={member.id} data={data} tasks={tasks} />
        </div>
      ))}
    </div>
  )
}
