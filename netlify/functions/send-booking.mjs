/*
  ==========================================================
  СЕРВЕРНАЯ ФУНКЦИЯ NETLIFY: отправка заявки в Telegram
  Работает НЕ в браузере посетителя, а на сервере Netlify.

  Токен бота и chat ID лежат в секретных настройках Netlify:
    Project configuration → Environment variables
      TELEGRAM_BOT_TOKEN = токен от BotFather
      TELEGRAM_CHAT_ID   = ваш chat id
  В коде их нет — поэтому их невозможно увидеть через F12.

  Адрес функции: /.netlify/functions/send-booking
  ==========================================================
*/

// Ответ в формате JSON
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Символы < > & в тексте клиента делаем безопасными для Telegram
function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default async (req) => {
  // Принимаем только отправку формы
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  let data;
  try {
    data = await req.json();
  } catch {
    return json({ ok: false, error: 'Bad request' }, 400);
  }

  // Ловушка для спам-ботов: скрытое поле, которое человек не видит и не заполняет.
  // Если оно заполнено — это бот. Делаем вид, что всё хорошо, но ничего не отправляем.
  if (data.website) {
    return json({ ok: true });
  }

  // Проверка обязательных полей и разумной длины (защита от мусора)
  const required = ['name', 'phone', 'service', 'date', 'time'];
  for (const field of required) {
    if (!data[field] || String(data[field]).trim() === '') {
      return json({ ok: false, error: 'Missing field: ' + field }, 400);
    }
  }
  const tooLong = Object.values(data).some((v) => String(v).length > 500);
  const digits = String(data.phone).replace(/\D/g, '');
  if (tooLong || digits.length < 10 || digits.length > 12) {
    return json({ ok: false, error: 'Invalid data' }, 400);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return json({ ok: false, error: 'Telegram is not configured' }, 500);
  }

  const message =
    '💈 <b>Нова заявка з сайту</b>\n\n' +
    '👤 <b>Ім\'я:</b> ' + escapeHtml(data.name) + '\n' +
    '📞 <b>Телефон:</b> ' + escapeHtml(data.phone) + '\n' +
    '✂️ <b>Послуга:</b> ' + escapeHtml(data.service) + '\n' +
    '🧔 <b>Майстер:</b> ' + escapeHtml(data.master) + '\n' +
    '📅 <b>Дата:</b> ' + escapeHtml(data.date) + ' о ' + escapeHtml(data.time) +
    (data.comment ? '\n💬 <b>Коментар:</b> ' + escapeHtml(data.comment) : '');

  const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
  });
  const result = await response.json();

  if (!result.ok) {
    // Причину пишем в журнал функции (Netlify → Logs → Functions), но не показываем посетителю
    console.error('Telegram error:', result.description);
    return json({ ok: false, error: 'Telegram error' }, 502);
  }

  return json({ ok: true });
};
