import { useState, useEffect, useCallback } from 'react'
import { getBoundAccounts } from '../lib/sync'
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
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(timer)
  }, [confirming])

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
        {confirming ? (
          <button className={styles.btnDelConfirm} onClick={() => { setConfirming(false); onRemove(task.key) }}>
            删除
          </button>
        ) : (
          <button className={styles.btnDel} onClick={() => setConfirming(true)}>
            ✕
          </button>
        )}
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

function BindEmailForm({ auth, householdId, onBindSuccess }) {
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const showToast = useToast()

  const handleBind = async (confirmed = false) => {
    setError('')
    setLoading(true)
    const result = await auth.bindEmail(email, password, householdId, confirmed)
    setLoading(false)
    if (result.conflict) {
      if (confirm(result.warning + '，确认绑定？')) {
        handleBind(true)
      }
    } else if (result.success) {
      setSuccess(true)
      showToast('邮箱绑定成功')
      onBindSuccess?.()
    } else if (result.error) {
      setError(result.error.message)
    }
  }

  if (success) {
    return <div className={styles.loginSuccess}>邮箱 {email} 绑定成功 ✓</div>
  }

  if (!showForm) {
    return (
      <button className={styles.btnBind} onClick={() => setShowForm(true)}>
        绑定邮箱
      </button>
    )
  }

  return (
    <div className={styles.boundList}>
      <div className={styles.loginForm}>
        <input
          className={styles.emailInput}
          type="email"
          placeholder="邮箱地址"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={styles.emailInput}
          type="password"
          placeholder="设置密码（至少6位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className={styles.loginActions}>
          <button className={styles.btnBack} onClick={() => setShowForm(false)}>
            取消
          </button>
          <button
            className={styles.btnLogin}
            disabled={!email || password.length < 6 || loading}
            onClick={() => handleBind(false)}
          >
            {loading ? '绑定中...' : '确认绑定'}
          </button>
        </div>
      </div>
      {error && <div className={styles.loginError}>{error}</div>}
    </div>
  )
}

function BindPhoneForm({ auth, householdId, onBindSuccess }) {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('idle') // idle | phone | otp
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const showToast = useToast()

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

  const handleBind = async (confirmed = false) => {
    setError('')
    setLoading(true)
    const result = await auth.bindPhone(phone, otp, householdId, confirmed)
    setLoading(false)
    if (result.conflict) {
      if (confirm(result.warning + '，确认绑定？')) {
        handleBind(true)
      }
    } else if (result.success) {
      showToast('手机号绑定成功')
      setStep('idle')
      onBindSuccess?.()
    } else if (result.error) {
      setError(result.error.message)
    }
  }

  if (step === 'idle') {
    return (
      <button className={styles.btnBind} onClick={() => setStep('phone')}>
        绑定手机号
      </button>
    )
  }

  return (
    <div className={styles.boundList}>
      {step === 'phone' && (
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
          <div className={styles.loginActions}>
            <button className={styles.btnBack} onClick={() => setStep('idle')}>
              取消
            </button>
            <button
              className={styles.btnLogin}
              disabled={phone.length < 11 || auth.otpSending || auth.cooldown > 0}
              onClick={handleSendOtp}
            >
              {auth.otpSending ? '发送中...' : auth.cooldown > 0 ? `${auth.cooldown}s 后重发` : '发送验证码'}
            </button>
          </div>
        </div>
      )}
      {step === 'otp' && (
        <div className={styles.loginForm}>
          <input
            className={styles.otpInput}
            type="tel"
            placeholder="输入验证码"
            value={otp}
            maxLength={6}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          />
          <div className={styles.loginActions}>
            <button className={styles.btnBack} onClick={() => { setStep('phone'); setOtp('') }}>
              返回
            </button>
            <button
              className={styles.btnLogin}
              disabled={otp.length < 6 || loading}
              onClick={() => handleBind(false)}
            >
              {loading ? '绑定中...' : '确认绑定'}
            </button>
          </div>
        </div>
      )}
      {error && <div className={styles.loginError}>{error}</div>}
    </div>
  )
}

function LoginCard({ user, loading, auth, householdId }) {
  const [loginMethod, setLoginMethod] = useState('phone') // phone | email
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState('input')
  const [error, setError] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [boundMethods, setBoundMethods] = useState(null) // null = loading, [] = none
  const showToast = useToast()

  const refreshBoundAccounts = useCallback(async () => {
    if (!householdId) return
    const accounts = await getBoundAccounts(householdId)
    setBoundMethods(accounts.map(a => a.auth_method))
  }, [householdId])

  useEffect(() => {
    if (user && householdId) {
      refreshBoundAccounts()
    }
  }, [user, householdId, refreshBoundAccounts])

  if (loading) return null

  if (user) {
    const phoneNum = user.phone || ''
    const userEmail = user.email || ''
    const masked = phoneNum.length > 4
      ? phoneNum.slice(0, phoneNum.length - 8) + '****' + phoneNum.slice(-4)
      : phoneNum
    const hasPhoneBound = boundMethods?.includes('phone')
    const hasEmailBound = boundMethods?.includes('email')

    return (
      <div className={styles.card}>
        <div className={styles.cardTitle}>👤 账户</div>
        <div className={styles.loggedInRow}>
          <span className={styles.phoneDisplay}>
            {phoneNum ? `📱 ${masked}` : `📧 ${userEmail}`}
          </span>
          <button className={styles.btnLogout} onClick={async () => {
            await auth.signOut()
            showToast('已退出登录')
          }}>退出</button>
        </div>

        {/* Binding section — check household_users, not user object */}
        {hasPhoneBound && !hasEmailBound && (
          <BindEmailForm auth={auth} householdId={householdId} onBindSuccess={refreshBoundAccounts} />
        )}
        {hasEmailBound && !hasPhoneBound && (
          <BindPhoneForm auth={auth} householdId={householdId} onBindSuccess={refreshBoundAccounts} />
        )}
        {hasPhoneBound && hasEmailBound && (
          <div className={styles.bindStatus}>📱 手机 + 📧 邮箱 已绑定</div>
        )}
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

  const handleVerifyOtp = async () => {
    setError('')
    const fullPhone = phone.startsWith('+') ? phone : '+86' + phone
    const { data, error: err } = await auth.verifyOtp(fullPhone, otp)
    if (err) {
      setError(err.message)
    } else if (data?.user) {
      showToast('✅ 登录成功')
      setStep('input')
      setOtp('')
    }
  }

  const handleEmailSignUp = async () => {
    setError('')
    setEmailLoading(true)
    const { error: err } = await auth.signUpWithEmail(email, password)
    if (err) {
      setEmailLoading(false)
      setError(err.message)
      return
    }
    // autoconfirm enabled — sign in immediately after signup
    const { error: signInErr } = await auth.signInWithEmail(email, password)
    setEmailLoading(false)
    if (signInErr) {
      setError(signInErr.message)
    } else {
      showToast('注册成功')
    }
  }

  const handleEmailSignIn = async () => {
    setError('')
    setEmailLoading(true)
    const { error: err } = await auth.signInWithEmail(email, password)
    setEmailLoading(false)
    if (err) {
      setError(err.message)
    } else {
      showToast('登录成功')
    }
  }

  const handleResetPassword = async () => {
    if (!email) {
      setError('请先输入邮箱地址')
      return
    }
    setError('')
    setEmailLoading(true)
    const { error: err } = await auth.resetPassword(email)
    setEmailLoading(false)
    if (err) {
      setError(err.message)
    } else {
      setStep('resetSent')
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>👤 账户</div>

      <div className={styles.loginTabs}>
        <button
          className={`${styles.loginTab} ${loginMethod === 'phone' ? styles.loginTabActive : ''}`}
          onClick={() => { setLoginMethod('phone'); setStep('input'); setError('') }}
        >
          手机登录
        </button>
        <button
          className={`${styles.loginTab} ${loginMethod === 'email' ? styles.loginTabActive : ''}`}
          onClick={() => { setLoginMethod('email'); setStep('input'); setError('') }}
        >
          邮箱登录
        </button>
      </div>

      {loginMethod === 'phone' && step === 'input' && (
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
      )}

      {loginMethod === 'phone' && step === 'otp' && (
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
            <button className={styles.btnBack} onClick={() => { setStep('input'); setOtp(''); setError('') }}>
              返回
            </button>
            <button
              className={styles.btnLogin}
              disabled={otp.length < 6 || auth.otpVerifying}
              onClick={handleVerifyOtp}
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

      {loginMethod === 'email' && step === 'input' && (
        <div className={styles.loginForm}>
          <input
            className={styles.emailInput}
            type="email"
            placeholder="邮箱地址"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={styles.emailInput}
            type="password"
            placeholder="密码（至少6位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className={styles.loginActions}>
            <button
              className={styles.btnSecondary}
              disabled={!email || password.length < 6 || emailLoading}
              onClick={handleEmailSignUp}
            >
              注册
            </button>
            <button
              className={styles.btnLogin}
              disabled={!email || !password || emailLoading}
              onClick={handleEmailSignIn}
            >
              {emailLoading ? '处理中...' : '登录'}
            </button>
          </div>
          <div className={styles.loginHintRow}>
            <span className={styles.loginHint}>新用户请先注册</span>
            <button className={styles.btnForgot} onClick={handleResetPassword} disabled={emailLoading}>
              忘记密码
            </button>
          </div>
        </div>
      )}

      {loginMethod === 'email' && step === 'resetSent' && (
        <div className={styles.loginForm}>
          <div className={styles.loginSuccess}>
            重置邮件已发送至 {email}，请查收
          </div>
          <button className={styles.btnLogin} onClick={() => setStep('input')}>
            返回登录
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
  auth, householdId,
}) {
  const [emojiPickerFor, setEmojiPickerFor] = useState(null)
  const [memberEmojiPickerFor, setMemberEmojiPickerFor] = useState(null)
  const [confirmingMemberId, setConfirmingMemberId] = useState(null)

  useEffect(() => {
    if (confirmingMemberId === null) return
    const timer = setTimeout(() => setConfirmingMemberId(null), 3000)
    return () => clearTimeout(timer)
  }, [confirmingMemberId])

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
          householdId={householdId}
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
                {confirmingMemberId === m.id ? (
                  <button
                    className={styles.btnDelConfirm}
                    onClick={() => { setConfirmingMemberId(null); onRemoveMember(i) }}
                  >
                    删除
                  </button>
                ) : (
                  <button
                    className={styles.btnDel}
                    onClick={() => setConfirmingMemberId(m.id)}
                  >
                    ✕
                  </button>
                )}
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
