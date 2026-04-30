import { useEffect, useState } from 'react';
import authFetch from './authFetch';
import { notifyGlobal } from '../context/NotificationsContext';

const EMPTY_FORM = {
  code: '',
  password: '',
  repeat: '',
};

export default function SettingsTab() {
  const [security, setSecurity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    let alive = true;
    authFetch('/api/admin/security')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (alive && data) setSecurity(data); })
      .catch(() => notifyGlobal('error', 'Не удалось загрузить настройки'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const requestCode = async () => {
    if (sending) return;
    setSending(true);
    try {
      const res = await authFetch('/api/admin/security/password-code', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notifyGlobal('error', data.error || 'Не удалось отправить код');
        return;
      }
      setCodeSent(true);
      notifyGlobal('success', `Код отправлен в Telegram ${data.ownerTelegramId || security?.ownerTelegramId || ''}`);
    } catch {
      notifyGlobal('error', 'Ошибка отправки кода');
    } finally {
      setSending(false);
    }
  };

  const changePassword = async () => {
    if (saving) return;
    if (!/^\d{4}$/.test(form.code.trim())) {
      notifyGlobal('error', 'Введите 4 цифры из Telegram');
      return;
    }
    if (form.password.length < 8) {
      notifyGlobal('error', 'Пароль минимум 8 символов');
      return;
    }
    if (form.password !== form.repeat) {
      notifyGlobal('error', 'Пароли не совпадают');
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch('/api/admin/security/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: form.code.trim(), password: form.password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notifyGlobal('error', data.error || 'Не удалось сменить пароль');
        return;
      }
      notifyGlobal('success', 'Пароль изменён. Войдите заново.');
      localStorage.removeItem('iwak_admin_token');
      setTimeout(() => { window.location.href = '/adminpanel'; }, 900);
    } catch {
      notifyGlobal('error', 'Ошибка смены пароля');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="adm-body settings-admin">Загрузка…</div>;

  const blocked = !security?.ownerTelegramConfigured || !security?.telegramBotConfigured;

  return (
    <div className="adm-body settings-admin">
      <div className="settings-admin__hero">
        <span>НАСТРОЙКИ</span>
        <h2>Доступ к админке</h2>
        <p>Смена пароля проходит через 4-значный код в личный Telegram владельца.</p>
      </div>

      <div className="settings-admin__panel">
        <div className="settings-admin__row">
          <span>Логин</span>
          <strong>{security?.login || 'admin'}</strong>
        </div>
        <div className="settings-admin__row">
          <span>Telegram владельца</span>
          <strong>{security?.ownerTelegramId || 'не настроен'}</strong>
        </div>
        <div className="settings-admin__row">
          <span>Telegram-бот</span>
          <strong className={security?.telegramBotConfigured ? 'settings-admin__ok' : 'settings-admin__warn'}>
            {security?.telegramBotConfigured ? 'готов' : 'не подключен'}
          </strong>
        </div>
        {security?.passwordChangedAt ? (
          <div className="settings-admin__row">
            <span>Пароль менялся</span>
            <strong>{new Date(security.passwordChangedAt).toLocaleString('ru-RU')}</strong>
          </div>
        ) : null}
      </div>

      <div className="settings-admin__panel">
        <div className="settings-admin__head">
          <div>
            <h3>Сменить пароль</h3>
            <span>Код действует 10 минут. После смены все старые сессии будут сброшены.</span>
          </div>
          <button className="adm-btn adm-btn--primary" type="button" onClick={requestCode} disabled={sending || blocked}>
            {sending ? 'ОТПРАВКА…' : codeSent ? 'ОТПРАВИТЬ ЕЩЁ' : 'ВЫСЛАТЬ КОД'}
          </button>
        </div>

        {blocked ? (
          <div className="settings-admin__notice">
            Для работы нужно указать на сервере `ADMIN_OWNER_TELEGRAM_ID` и подключить Telegram-бота в разделе автоматизации.
          </div>
        ) : null}

        <div className="settings-admin__form">
          <input
            className="adm-input"
            inputMode="numeric"
            maxLength={4}
            placeholder="Код из письма"
            value={form.code}
            onChange={(e) => setForm((v) => ({ ...v, code: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
          />
          <input
            className="adm-input"
            type="password"
            placeholder="Новый пароль"
            value={form.password}
            onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))}
          />
          <input
            className="adm-input"
            type="password"
            placeholder="Повторите пароль"
            value={form.repeat}
            onChange={(e) => setForm((v) => ({ ...v, repeat: e.target.value }))}
          />
          <button className="adm-btn adm-btn--primary" type="button" onClick={changePassword} disabled={saving || blocked}>
            {saving ? 'СОХРАНЯЮ…' : 'ИЗМЕНИТЬ ПАРОЛЬ'}
          </button>
        </div>
      </div>
    </div>
  );
}
