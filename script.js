/*
  ==========================================================
  JAVASCRIPT: Барбершоп «Лезо»
  1) мобильное меню
  2) кнопки «Обрати» у услуг подставляют услугу в форму
  3) дата и время: нельзя выбрать прошедшие день и час
  4) проверка формы
  5) отправка заявки на сервер Netlify (он пересылает её в Telegram) и окно «Спасибо»
  ==========================================================
*/

/* ---------- 1. Мобильное меню ---------- */
const burger = document.getElementById('burger');
const nav = document.getElementById('nav');

burger.addEventListener('click', function () {
  nav.classList.toggle('is-open');
});
nav.querySelectorAll('a').forEach(function (link) {
  link.addEventListener('click', function () { nav.classList.remove('is-open'); });
});


/* ---------- 2. Кнопки «Обрати» → услуга сразу выбрана в форме ---------- */
const serviceSelect = document.getElementById('serviceSelect');

document.querySelectorAll('.service__pick').forEach(function (button) {
  button.addEventListener('click', function () {
    serviceSelect.value = button.dataset.service;
    checkField(serviceSelect); // если тут была ошибка — убираем её
  });
});


/* ---------- 3. Дата и время ---------- */
const dateInput = document.getElementById('dateInput');
const timeSelect = document.getElementById('timeSelect');

// Превращает дату в текст ГГГГ-ММ-ДД — такой формат понимает поле type="date"
function toDateText(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

const todayText = toDateText(new Date());
dateInput.min = todayText; // раньше сегодняшнего дня выбрать нельзя

/*
  Обновляет список часов.
  Если выбран СЕГОДНЯШНИЙ день — часы, которые уже прошли, становятся недоступными.
  Пример: сейчас 13:20 → 10:00…13:00 недоступны, 14:00 и позже можно.
  Возвращает количество свободных часов.
*/
function updateTimes() {
  const now = new Date();
  const isToday = dateInput.value === toDateText(now);
  let freeCount = 0;

  timeSelect.querySelectorAll('option').forEach(function (option) {
    if (option.value === '') return; // пропускаем «Оберіть час»

    // Запоминаем исходное время ('14:00') один раз, чтобы подпись «— минув» не портила значение
    if (!option.dataset.time) option.dataset.time = option.value;
    const time = option.dataset.time;
    option.value = time;

    const hour = parseInt(time); // '14:00' → 14
    const isPast = isToday && hour <= now.getHours();

    option.disabled = isPast;                               // недоступно для выбора
    option.textContent = time + (isPast ? ' — минув' : ''); // подпись для понятности
    if (!isPast) freeCount++;
  });

  // Если был выбран час, который теперь недоступен, — сбрасываем выбор
  if (timeSelect.selectedOptions[0] && timeSelect.selectedOptions[0].disabled) {
    timeSelect.value = '';
  }
  return freeCount;
}

// Выбирает дату по умолчанию: сегодня, а если сегодня свободных часов уже нет — завтра
function setDefaultDate() {
  dateInput.value = todayText;
  if (updateTimes() === 0) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.value = toDateText(tomorrow);
    updateTimes();
  }
}

setDefaultDate();
dateInput.addEventListener('change', updateTimes); // сменили дату → пересчитали часы


/* ---------- 4. Проверка формы ---------- */
const form = document.getElementById('bookingForm');
const submitButton = form.querySelector('button[type="submit"]');
const formError = document.getElementById('formError');
const success = document.getElementById('success');
const successText = document.getElementById('successText');

// Проверяет ОДНО поле и показывает/прячет ошибку
function checkField(input) {
  let ok = input.value.trim() !== ''; // поле не пустое?

  if (input.name === 'phone') {
    const digits = input.value.replace(/\D/g, ''); // оставляем только цифры
    ok = digits.length >= 10 && digits.length <= 12;
  }

  if (input.name === 'date') {
    ok = input.value !== '' && input.value >= todayText; // не в прошлом
  }

  input.closest('.field').classList.toggle('is-invalid', !ok);
  return ok;
}

// Когда человек исправляет поле — ошибка сразу пропадает
form.querySelectorAll('[required]').forEach(function (input) {
  input.addEventListener('input', function () { checkField(input); });
  input.addEventListener('change', function () { checkField(input); });
});


/* ---------- 5. Отправка заявки ----------
   Сайт НЕ знает токен Telegram. Он отправляет заявку на наш маленький сервер —
   «функцию» Netlify (файл netlify/functions/send-booking.mjs).
   Функция берёт токен из секретных настроек Netlify и уже сама пишет в Telegram.
   Поэтому через F12 токен никто не увидит.

   На вашем компьютере (Live Server) функции нет — там отправка покажет ошибку.
   Это нормально: проверяем форму на опубликованном сайте. */
async function sendBooking(data, niceDate) {
  const response = await fetch('/.netlify/functions/send-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, date: niceDate })
  });

  const result = await response.json().catch(function () { return {}; });
  if (!response.ok || !result.ok) {
    throw new Error(result.error || ('HTTP ' + response.status));
  }
}

form.addEventListener('submit', async function (event) {
  event.preventDefault(); // не даём браузеру перезагрузить страницу
  formError.hidden = true;

  // Перед проверкой ещё раз обновляем часы: вдруг пока человек заполнял форму, время прошло
  updateTimes();

  let allOk = true;
  form.querySelectorAll('[required]').forEach(function (input) {
    if (!checkField(input)) allOk = false;
  });
  if (!allOk) {
    form.querySelector('.is-invalid').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  const niceDate = data.date.split('-').reverse().join('.'); // 2026-11-07 → 07.11.2026

  // Блокируем кнопку, чтобы заявку не отправили дважды
  submitButton.disabled = true;
  submitButton.textContent = 'Надсилаємо...';

  try {
    await sendBooking(data, niceDate);

    successText.textContent =
      data.name + ', чекаємо вас ' + niceDate + ' о ' + data.time +
      ' на послугу «' + data.service + '». Адміністратор зателефонує для підтвердження.';
    form.hidden = true;
    success.hidden = false;
  } catch (error) {
    console.error('Помилка відправки заявки:', error.message);
    formError.hidden = false; // показываем клиенту запасной вариант — позвонить
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Записатися';
  }
});

// Кнопка «Новий запис» — очищаем форму и показываем её снова
document.getElementById('newBooking').addEventListener('click', function () {
  form.reset();
  setDefaultDate();
  success.hidden = true;
  form.hidden = false;
});
