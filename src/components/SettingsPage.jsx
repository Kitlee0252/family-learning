import { useState } from 'react'
import { TASK_EMOJIS, MEMBER_EMOJIS } from '../utils/constants'
import { useToast } from './Toast'
import styles from './SettingsPage.module.css'

function EmojiPicker({ current, onSelect, onClose, emojis = TASK_EMOJIS }) {
  return (
    <div className={styles.emojiPickerBackdrop} onClick={onClose}>
      <div className={styles.emojiPicker} onClick={(e) => e.stopPropagation()}>
        <div className={styles.pickerHeader}>
          <span className={styles.pickerTitle}>选择图标</span>
          <button className={styles.pickerClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.emojiGrid}>
          {emojis.map((emoji, i) => (
            <button
              key={`${emoji}_${i}`}
              className={`${styles.emojiOption} ${emoji === current ? styles.emojiSelected : ''}`}
              onClick={() => { onSelect(emoji); onClose() }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task, onRemove, onUpdate, pickerOpen, onTogglePicker }) {
  return (
    <div className={styles.taskRowWrap}>
      <div className={styles.taskRow}>
        <button
          className={styles.taskEmojiBtn}
          onClick={() => onTogglePicker(task.key)}
          title="选择图标"
        >
          {task.emoji}
        </button>
        <input
          className={styles.memberInput}
          value={task.label}
          placeholder="项目名称"
          onChange={(e) => onUpdate(task.key, 'label', e.target.value)}
        />
        <button className={styles.btnDel} onClick={() => onRemove(task.key)}>
          ✕
        </button>
      </div>
      {pickerOpen && (
        <EmojiPicker
          current={task.emoji}
          onSelect={(emoji) => onUpdate(task.key, 'emoji', emoji)}
          onClose={() => onTogglePicker(null)}
        />
      )}
    </div>
  )
}

function LoginCard({ user, loading, auth }) {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('phone') // phone | otp
  const [error, setError] = useState('')
  const showToast = useToast()

  if (loading) return null

  if (user) {
    const phoneNum = user.phone || ''
    const masked = phoneNum.length > 4
      ? phoneNum.slice(0, phoneNum.length - 8) + '****' + phoneNum.slice(-4)
      : phoneNum
    return (
      <div className={styles.card}>
        <div className={styles.cardTitle}>👤 账户</div>
        <div className={styles.loggedInRow}>
          <span className={styles.phoneDisplay}>📱 {masked}</span>
          <button className={styles.btnLogout} onClick={async () => {
            await auth.signOut()
            showToast('已退出登录')
          }}>退出</button>
        </div>
      </div>
    )
  }

  const handleSendOtp = async () => {
    setError('')
    const fullPhone = phone.startsWith('+') ? phone : '+86' + phone
    const { error: err } = await auth.sendOtp(fullPhone)
    if (err) {
      setError(err.message)
    } else {
      setStep('otp')
    }
  }

  const handleVerify = async () => {
    setError('')
    const fullPhone = phone.startsWith('+') ? phone : '+86' + phone
    const { data, error: err } = await auth.verifyOtp(fullPhone, otp)
    if (err) {
      setError(err.message)
    } else if (data?.user) {
      showToast('✅ 登录成功')
      setStep('phone')
      setOtp('')
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>👤 账户</div>
      {step === 'phone' ? (
        <div className={styles.loginForm}>
          <div className={styles.phoneRow}>
            <span className={styles.phonePrefix}>+86</span>
            <input
              className={styles.phoneInput}
              type="tel"
              placeholder="手机号"
              value={phone}
              maxLength={11}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <button
            className={styles.btnLogin}
            disabled={phone.length < 11 || auth.otpSending || auth.cooldown > 0}
            onClick={handleSendOtp}
          >
            {auth.otpSending ? '发送中...' : auth.cooldown > 0 ? `${auth.cooldown}s 后重发` : '获取验证码'}
          </button>
        </div>
      ) : (
        <div className={styles.loginForm}>
          <input
            className={styles.otpInput}
            type="tel"
            placeholder="输入验证码"
            value={otp}
            maxLength={6}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          />
          <div className={styles.otpActions}>
            <button className={styles.btnBack} onClick={() => { setStep('phone'); setOtp(''); setError('') }}>
              返回
            </button>
            <button
              className={styles.btnLogin}
              disabled={otp.length < 6 || auth.otpVerifying}
              onClick={handleVerify}
            >
              {auth.otpVerifying ? '验证中...' : '登录'}
            </button>
          </div>
          <button
            className={styles.btnResend}
            disabled={auth.cooldown > 0 || auth.otpSending}
            onClick={handleSendOtp}
          >
            {auth.cooldown > 0 ? `${auth.cooldown}s 后可重发` : '重新发送'}
          </button>
        </div>
      )}
      {error && <div className={styles.loginError}>{error}</div>}
    </div>
  )
}

export default function SettingsPage({
  members, tasks,
  onAddMember, onRemoveMember, onUpdateMemberName, onUpdateMemberEmoji,
  onAddTask, onRemoveTask, onUpdateTask,
  auth,
}) {
  const [emojiPickerFor, setEmojiPickerFor] = useState(null)
  const [memberEmojiPickerFor, setMemberEmojiPickerFor] = useState(null)

  const togglePicker = (taskKey) => {
    setEmojiPickerFor(prev => prev === taskKey ? null : taskKey)
  }

  return (
    <div>
      {auth && (
        <LoginCard
          user={auth.user}
          loading={auth.loading}
          auth={auth}
        />
      )}

      <div className={styles.card}>
        <div className={styles.cardTitle}>👨‍👩‍👧‍👦 家庭成员</div>
        <div className={styles.memberList}>
          {members.map((m, i) => (
            <div key={m.id} className={styles.taskRowWrap}>
              <div className={styles.memberRow}>
                <button
                  className={styles.taskEmojiBtn}
                  onClick={() => setMemberEmojiPickerFor(prev => prev === i ? null : i)}
                  title="选择头像"
                >
                  {m.emoji}
                </button>
                <input
                  className={styles.memberInput}
                  value={m.name}
                  placeholder="姓名"
                  onChange={(e) => onUpdateMemberName(i, e.target.value)}
                />
                <button
                  className={styles.btnDel}
                  onClick={() => onRemoveMember(i)}
                >
                  ✕
                </button>
              </div>
              {memberEmojiPickerFor === i && (
                <EmojiPicker
                  current={m.emoji}
                  emojis={MEMBER_EMOJIS}
                  onSelect={(emoji) => onUpdateMemberEmoji(i, emoji)}
                  onClose={() => setMemberEmojiPickerFor(null)}
                />
              )}
            </div>
          ))}
        </div>
        <button className={styles.btnAdd} onClick={onAddMember}>
          ＋ 添加成员
        </button>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>📋 学习项目</div>
        <div className={styles.memberList}>
          {tasks.map((task) => (
            <TaskRow
              key={task.key}
              task={task}
              onRemove={onRemoveTask}
              onUpdate={onUpdateTask}
              pickerOpen={emojiPickerFor === task.key}
              onTogglePicker={togglePicker}
            />
          ))}
        </div>
        <button className={styles.btnAdd} onClick={onAddTask}>
          ＋ 添加项目
        </button>
      </div>



    </div>
  )
}
