const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const executable = path.resolve(__dirname, '../../../outputs/installers/win-unpacked/总结记录.exe');
const debugPort = 9235;
const appData = path.resolve(__dirname, '../.smoke-appdata-1.0.4');
const debugBase = `http://127.0.0.1:${debugPort}`;
const smokeKey = '__shiriPackagingSmoke';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget(processHandle) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (processHandle.exitCode !== null) throw new Error(`App exited with code ${processHandle.exitCode}`);
    try {
      const targets = await fetch(`${debugBase}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === 'page' && target.title === '总结记录' && target.url.startsWith('shiri://journal/'));
      if (page) return page;
    } catch { /* The debug server is not ready yet. */ }
    await delay(250);
  }
  const targets = await fetch(`${debugBase}/json/list`).then((response) => response.json()).catch(() => []);
  throw new Error(`Timed out waiting for the app page. Debug targets: ${JSON.stringify(targets)}`);
}

function evaluate(target, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const timer = setTimeout(() => { socket.close(); reject(new Error('Timed out evaluating the app page.')); }, 5000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true }
    })));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.error || message.result.exceptionDetails) {
        reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
        return;
      }
      resolve(message.result.result.value);
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Could not connect to the app page.')); });
  });
}

async function closeAppTarget(target) {
  await fetch(`${debugBase}/json/close/${target.id}`);
}

async function reloadTarget(processHandle) {
  await delay(500);
  return waitForTarget(processHandle);
}

async function testPeriodAndCategoryFeatures(run) {
  let result = await evaluate(run.target, `(() => {
    document.querySelector('[data-view="calendar"]').click();
    document.querySelector('[data-date].today, [data-date]').click();
    document.querySelector('[data-action="manage-categories"]').click();
    const input = document.getElementById('newCategoryInput');
    input.value = '自定义分类';
    document.getElementById('addCategoryButton').click();
    const added = [...document.querySelectorAll('#categoryManagerList .category-row')].some((row) => row.textContent.includes('自定义分类'));
    document.getElementById('closeCategoryDialog').click();
    const state = JSON.parse(localStorage.getItem('shiri-journal-v1'));
    state.entries = [
      { id: 'smoke-a', date: '2025-12-30', time: '10:00', title: '跨年事项 A', detail: '说明 A', tag: '工作', project: '', duration: 30 },
      { id: 'smoke-b', date: '2025-12-31', time: '11:00', title: '跨年事项 B', detail: '说明 B', tag: '自定义分类', project: '', duration: 45 },
      { id: 'smoke-c', date: '2026-01-01', time: '12:00', title: '跨年事项 C', detail: '说明 C', tag: '工作', project: '', duration: 60 }
    ];
    state.notes = { 'week-2025-12-29': '跨年周感想', 'month-2025-12': '十二月感想' };
    localStorage.setItem('shiri-journal-v1', JSON.stringify(state));
    return { added, customPersisted: state.categories.includes('自定义分类') };
  })()`);
  assert.equal(result.added, true, 'custom category appears in the category manager');
  assert.equal(result.customPersisted, true, 'custom category persists in local data');

  await evaluate(run.target, `location.reload()`);
  run.target = await reloadTarget(run.appProcess);
  result = await evaluate(run.target, `(() => {
    document.querySelector('[data-view="week"]').click();
    const history = document.getElementById('periodHistory');
    const option = [...history.options].find((item) => item.value === '2025-12-29');
    history.value = option.value;
    history.dispatchEvent(new Event('change', { bubbles: true }));
    const banner = document.querySelector('.period-banner').innerText;
    const defaultMode = document.querySelector('[data-summary-mode="date"]')?.getAttribute('aria-pressed');
    const dateModeRows = document.querySelectorAll('.auto-summary-item.date-mode').length;
    document.querySelector('[data-summary-mode="type"]').click();
    const typeModeActive = document.querySelector('[data-summary-mode="type"]')?.getAttribute('aria-pressed');
    const typeGroups = [...document.querySelectorAll('.auto-summary-group h3')].map((item) => item.textContent);
    const typeModeRows = document.querySelectorAll('.auto-summary-item:not(.date-mode)').length;
    const typeGridColumns = getComputedStyle(document.querySelector('.auto-summary-item')).gridTemplateColumns;
    const timeStatsAtBottom = document.querySelector('.period-main').lastElementChild.classList.contains('time-stats');
    document.querySelector('[data-summary-mode="date"]').click();
    const dateModeRestored = document.querySelector('[data-summary-mode="date"]')?.getAttribute('aria-pressed');
    const summaryDate = document.querySelector('.auto-summary-item[data-open-entry="smoke-b"]')?.closest('.auto-summary-group')?.querySelector('h3')?.textContent;
    const timeGroup = document.querySelector('.time-stat-row');
    const timeGroupLabel = timeGroup?.querySelector('.time-stat-label')?.textContent;
    const timeGroupTotal = timeGroup?.querySelector('.time-stat-total')?.textContent;
    timeGroup?.click();
    const timeDetails = [...document.querySelectorAll('.time-stat-details:not([hidden]) .time-stat-detail')].map((item) => item.dataset.openEntry);
    document.querySelector('[data-metric="records"]').click();
    const recordCount = document.querySelectorAll('#metricDetails [data-open-entry]').length;
    document.querySelector('#metricDetails [data-open-entry="smoke-a"]').click();
    const recordOpened = document.querySelector('[data-entry-card="smoke-a"]')?.textContent.includes('说明 A');
    const customOption = [...document.querySelectorAll('#entryTag option')].some((item) => item.value === '自定义分类');
    return { historyOption: option?.textContent, banner, defaultMode, dateModeRows, typeModeActive, typeGroups, typeModeRows, typeGridColumns, timeStatsAtBottom, dateModeRestored, summaryDate, timeGroupLabel, timeGroupTotal, timeDetails, recordCount, recordOpened, customOption };
  })()`);
  assert.match(result.historyOption, /2025年12月29日-2026年1月4日/);
  assert.match(result.historyOption, /隶属于2026年1月/);
  assert.match(result.banner, /2025年12月29日-2026年1月4日/);
  assert.match(result.banner, /隶属于2026年1月/);
  assert.equal(result.defaultMode, 'true', 'weekly automatic summary defaults to date mode');
  assert.equal(result.dateModeRows, 3, 'date mode lists records under dates');
  assert.equal(result.typeModeActive, 'true', 'type mode becomes active when selected');
  assert(result.typeGroups.some((label) => label.startsWith('工作')), 'type mode groups records by category');
  assert.equal(result.typeModeRows, 3, 'type mode retains every record');
  assert.match(result.typeGridColumns, /\d+px/);
  assert.equal(result.timeStatsAtBottom, true, 'weekly time statistics stay at the bottom of the main column');
  assert.equal(result.dateModeRestored, 'true', 'date mode can be selected again');
  assert.match(result.summaryDate, /2025年12月31日 周三/);
  assert.equal(result.timeGroupLabel, '工作', 'time statistics group durations by category');
  assert.equal(result.timeGroupTotal, '1时30分', 'category time statistic totals the matching records');
  assert.deepEqual(result.timeDetails, ['smoke-c', 'smoke-a'], 'category time statistic expands to individual activities');
  assert.equal(result.recordCount, 3, 'weekly record count opens three details');
  assert.equal(result.recordOpened, true, 'metric detail opens the selected daily record');
  assert.equal(result.customOption, true, 'custom category remains available after reload');

  result = await evaluate(run.target, `(() => {
    document.querySelector('[data-view="week"]').click();
    document.querySelector('[data-metric="days"]').click();
    const dayCount = document.querySelectorAll('#metricDetails [data-open-date]').length;
    document.querySelector('#metricDetails [data-open-date="2025-12-31"]').click();
    const dayOpened = document.querySelector('[data-entry-card="smoke-b"]')?.textContent.includes('说明 B');
    document.querySelector('[data-view="week"]').click();
    document.querySelector('[data-metric="time"]').click();
    const timeDetail = document.querySelector('#metricDetails').textContent.includes('1时00分');
    const weekdayLabel = document.querySelector('.auto-summary-item[data-open-entry="smoke-b"]')?.closest('.auto-summary-group')?.querySelector('h3')?.textContent;
    document.querySelector('.auto-summary-item[data-open-entry="smoke-b"]').click();
    const summaryOpened = document.querySelector('[data-entry-card="smoke-b"]')?.textContent.includes('说明 B');
    return { dayCount, dayOpened, timeDetail, weekdayLabel, summaryOpened };
  })()`);
  assert.equal(result.dayCount, 3, 'weekly active-day metric opens distinct dates');
  assert.equal(result.dayOpened, true, 'active-day detail opens that date');
  assert.equal(result.timeDetail, true, 'weekly time metric shows per-entry duration');
  assert.match(result.weekdayLabel, /2025年12月31日 周三/);
  assert.equal(result.summaryOpened, true, 'auto-summary item opens its daily detail');

  result = await evaluate(run.target, `(() => {
    document.querySelector('[data-view="month"]').click();
    const history = document.getElementById('periodHistory');
    const option = [...history.options].find((item) => item.value === '2025-12');
    history.value = option.value;
    history.dispatchEvent(new Event('change', { bubbles: true }));
    const heading = document.querySelector('.period-banner h2').textContent;
    const defaultMode = document.querySelector('[data-summary-mode="date"]')?.getAttribute('aria-pressed');
    const dateModeRows = document.querySelectorAll('.auto-summary-item.date-mode').length;
    document.querySelector('[data-summary-mode="type"]').click();
    const typeGroupLabels = [...document.querySelectorAll('.auto-summary-group h3')].map((item) => item.textContent);
    const timeRow = document.querySelector('.time-stat-row');
    const timeLabel = timeRow?.querySelector('.time-stat-label')?.textContent;
    const timeStatsAtBottom = document.querySelector('.period-main').lastElementChild.classList.contains('time-stats');
    timeRow?.click();
    const timeDetailCount = document.querySelectorAll('.time-stat-details:not([hidden]) .time-stat-detail').length;
    document.querySelector('[data-metric="records"]').click();
    const recordCount = document.querySelectorAll('#metricDetails [data-open-entry]').length;
    document.querySelector('[data-metric="days"]').click();
    const dayCount = document.querySelectorAll('#metricDetails [data-open-date]').length;
    return { option: option?.textContent, heading, defaultMode, dateModeRows, typeGroupLabels, timeLabel, timeDetailCount, timeStatsAtBottom, recordCount, dayCount };
  })()`);
  assert.match(result.option, /2025年12月/);
  assert.equal(result.heading, '2025年12月记录');
  assert.equal(result.defaultMode, 'true', 'monthly automatic summary defaults to date mode');
  assert.equal(result.dateModeRows, 2, 'monthly date mode lists records by day');
  assert(result.typeGroupLabels.some((label) => label.startsWith('工作')));
  assert.equal(result.timeLabel, '工作', 'monthly time statistics group durations by category');
  assert.equal(result.timeDetailCount, 1, 'monthly category expands to its individual activity');
  assert.equal(result.timeStatsAtBottom, true, 'monthly time statistics stay at the bottom of the main column');
  assert.equal(result.recordCount, 2, 'monthly record count opens matching details');
  assert.equal(result.dayCount, 2, 'monthly active-day count opens distinct dates');

  result = await evaluate(run.target, `(() => {
    document.querySelector('[data-view="week"]').click();
    const history = document.getElementById('periodHistory');
    history.value = '2025-12-29';
    history.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('.auto-summary-item[data-open-entry="smoke-b"]').click();
    document.querySelector('[data-edit="smoke-b"]').click();
    const form = {
      title: document.getElementById('entryTitle').value,
      detail: document.getElementById('entryText').value,
      hours: document.getElementById('entryDurationHours').value,
      minutes: document.getElementById('entryDurationMinutes').value,
      saveLabel: document.getElementById('saveEntry').textContent.trim()
    };
    document.getElementById('entryTitle').value = '修改后的跨年事项';
    document.getElementById('entryText').value = '已修改内容';
    document.getElementById('entryDurationHours').value = '2';
    document.getElementById('entryDurationMinutes').value = '5';
    document.getElementById('saveEntry').click();
    const state = JSON.parse(localStorage.getItem('shiri-journal-v1'));
    const entry = state.entries.find((item) => item.id === 'smoke-b');
    return {
      form,
      updated: { id: entry.id, date: entry.date, time: entry.time, title: entry.title, detail: entry.detail, duration: entry.duration },
      card: document.querySelector('[data-entry-card="smoke-b"]')?.textContent
    };
  })()`);
  assert.equal(result.form.title, '跨年事项 B');
  assert.equal(result.form.detail, '说明 B');
  assert.equal(result.form.hours, '0');
  assert.equal(result.form.minutes, '45');
  assert.match(result.form.saveLabel, /保存修改/);
  assert.deepEqual(result.updated, { id: 'smoke-b', date: '2025-12-31', time: '11:00', title: '修改后的跨年事项', detail: '已修改内容', duration: 125 });
  assert.match(result.card, /2时05分/);

  result = await evaluate(run.target, `(() => {
    document.querySelector('[data-view="week"]').click();
    const history = document.getElementById('periodHistory');
    const summary = document.querySelector('.period-summary-top');
    const order = history.compareDocumentPosition(summary);
    const historyLabelDirection = getComputedStyle(document.querySelector('.period-history label')).flexDirection;
    return { historyBeforeSummary: Boolean(order & Node.DOCUMENT_POSITION_FOLLOWING), historyLabelDirection };
  })()`);
  assert.equal(result.historyBeforeSummary, true, 'automatic summary follows the period history selector');
  assert.equal(result.historyLabelDirection, 'row', 'period history selector is laid out horizontally');
  result = await evaluate(run.target, `(() => {
    document.querySelector('[data-view="calendar"]').click();
    document.querySelector('[data-date].today, [data-date]').click();
    const list = document.querySelector('.list-head');
    const composer = document.querySelector('.composer');
    const order = list.compareDocumentPosition(composer);
    return { listBeforeComposer: Boolean(order & Node.DOCUMENT_POSITION_FOLLOWING), dayDuration: document.querySelector('.stat-box:nth-child(2) .stat-value').textContent };
  })()`);
  assert.equal(result.listBeforeComposer, true, 'daily records precede the quick-entry form');
  assert.match(result.dayDuration, /时\d{2}分/);
  result = await evaluate(run.target, `(() => {
    document.getElementById('entryTitle').value = '日记录耗时统计测试';
    document.getElementById('entryText').value = '检查日视图按分类展开活动耗时';
    document.getElementById('entryTag').value = '工作';
    document.getElementById('entryDurationHours').value = '0';
    document.getElementById('entryDurationMinutes').value = '30';
    document.getElementById('saveEntry').click();
    const panel = document.querySelector('.insight-column .time-stats');
    const isAtBottom = panel === document.querySelector('.insight-column').lastElementChild;
    const row = panel?.querySelector('.time-stat-row');
    const total = row?.querySelector('.time-stat-total')?.textContent;
    row?.click();
    const detail = [...panel.querySelectorAll('.time-stat-detail')].find((item) => item.textContent.includes('日记录耗时统计'));
    const detailTime = detail?.querySelector('.time-stat-detail-time')?.textContent;
    detail?.click();
    const activityOpened = document.querySelector('[data-entry-card]')?.textContent.includes('日记录耗时统计');
    return { isAtBottom, total, detailTime, activityOpened };
  })()`);
  assert.equal(result.isAtBottom, true, 'daily time statistics appear at the bottom of the right insight column');
  assert.equal(result.total, '0时30分', 'daily time statistic totals activity duration');
  assert.equal(result.detailTime, '0时30分', 'daily category expands to the individual activity duration');
  assert.equal(result.activityOpened, true, 'daily time detail opens its activity');

  await evaluate(run.target, `(() => {
    const state = JSON.parse(localStorage.getItem('shiri-journal-v1'));
    const base = new Date(2024, 0, 1);
    state.entries = [
      { id: 'smoke-a', date: '2025-12-30', time: '10:00', title: '跨年事项 A', detail: '说明 A', tag: '工作', project: '', duration: 30 },
      { id: 'smoke-b', date: '2025-12-31', time: '11:00', title: '跨年事项 B', detail: '说明 B', tag: '自定义分类', project: '', duration: 45 },
      { id: 'smoke-c', date: '2026-01-01', time: '12:00', title: '跨年事项 C', detail: '说明 C', tag: '工作', project: '', duration: 60 },
      ...Array.from({ length: 105 }, (_, index) => {
        const date = new Date(base);
        date.setDate(base.getDate() + index);
        const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        return { id: 'bulk-' + index, date: key, time: '09:00', title: '旧日志 ' + index, detail: '', tag: '工作', project: '', duration: 0 };
      })
    ];
    localStorage.setItem('shiri-journal-v1', JSON.stringify(state));
    location.reload();
  })()`);
  run.target = await reloadTarget(run.appProcess);
  result = await evaluate(run.target, `(() => {
    const items = [...document.querySelectorAll('#recentEntries [data-open-entry]')];
    const list = document.getElementById('recentEntries');
    const rects = items.map((item) => item.getBoundingClientRect());
    const rowsDoNotOverlap = rects.slice(1).every((rect, index) => rect.top >= rects[index].bottom - 1);
    const overflowY = getComputedStyle(list).overflowY;
    list.scrollTop = list.scrollHeight;
    const scrollable = list.scrollHeight > list.clientHeight && list.scrollTop > 0;
    list.scrollTop = 0;
    return { count: items.length, first: items[0]?.dataset.openEntry, last: items.at(-1)?.dataset.openEntry, excludesOldest: !items.some((item) => item.dataset.openEntry === 'bulk-0'), rowsDoNotOverlap, overflowY, scrollable };
  })()`);
  assert.equal(result.count, 100, 'sidebar is capped at 100 recent records');
  assert.equal(result.first, 'smoke-c', 'sidebar sorts records newest first');
  assert.equal(result.last, 'bulk-8', 'sidebar retains the newest 100 records');
  assert.equal(result.excludesOldest, true);
  assert.equal(result.rowsDoNotOverlap, true, 'recent log rows keep separate layout boxes');
  assert.equal(result.overflowY, 'auto', 'recent logs use a vertical scroll area');
  assert.equal(result.scrollable, true, 'recent logs can be scrolled through the full list');

  result = await evaluate(run.target, `(() => {
    const input = document.getElementById('searchInput');
    input.value = '旧日志 42';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const matches = [...document.querySelectorAll('.search-result[data-open-entry]')];
    const searchCount = document.querySelector('.search-results-panel .section-hint')?.textContent;
    const matchedId = matches[0]?.dataset.openEntry;
    matches[0]?.click();
    return { searchCount, matchedId, opened: Boolean(document.querySelector('[data-entry-card="bulk-42"]')) };
  })()`);
  assert.equal(result.searchCount, '1 条结果', 'search filters records across all dates');
  assert.equal(result.matchedId, 'bulk-42', 'search finds a title outside the selected date');
  assert.equal(result.opened, true, 'search results open their daily record');
}

async function launchApp() {
  const appProcess = spawn(executable, [`--user-data-dir=${appData}`, `--remote-debugging-port=${debugPort}`], {
    env: { ...process.env, APPDATA: appData, SHIRI_SMOKE_DATA: appData },
    stdio: 'ignore',
    windowsHide: true
  });
  appProcess.on('error', (error) => { throw error; });
  try {
    const target = await waitForTarget(appProcess);
    return { appProcess, target };
  } catch (error) {
    if (appProcess.exitCode === null) {
      require('node:child_process').execFileSync('taskkill.exe', ['/PID', String(appProcess.pid), '/T', '/F'], { stdio: 'ignore' });
    }
    throw error;
  }
}

async function main() {
  let run;
  try {
    run = await launchApp();
    const initial = await evaluate(run.target, `(() => {
      const data = { title: document.title, heading: document.getElementById('pageTitle')?.textContent, calendarDays: document.querySelectorAll('[data-date]').length };
      localStorage.setItem('${smokeKey}', 'persisted');
      return data;
    })()`);
    assert.equal(initial.title, '总结记录');
    assert.match(initial.heading, /年\d+月/);
    assert.equal(initial.calendarDays, 42);
    await closeAppTarget(run.target);
    await Promise.race([new Promise((resolve) => run.appProcess.once('exit', resolve)), delay(5000)]);
    if (run.appProcess.exitCode === null) throw new Error('The app did not close after its window was closed.');

    run = await launchApp();
    const persistedValue = await evaluate(run.target, `(() => {
      const value = localStorage.getItem('${smokeKey}');
      localStorage.removeItem('${smokeKey}');
      return value;
    })()`);
    assert.equal(persistedValue, 'persisted');
    await testPeriodAndCategoryFeatures(run);
    await closeAppTarget(run.target);
    await Promise.race([new Promise((resolve) => run.appProcess.once('exit', resolve)), delay(5000)]);
    if (run.appProcess.exitCode === null) throw new Error('The app did not close after the persistence check.');
    run = null;
    console.log('PASS: app launch, local persistence, period history, clickable metrics, weekday-linked summaries, custom categories, 100-entry recent list, editing, duration formatting, and requested layout order.');
  } finally {
    if (run?.appProcess.exitCode === null) {
      try { await closeAppTarget(run.target); } catch { /* The target may already be gone. */ }
      await Promise.race([new Promise((resolve) => run.appProcess.once('exit', resolve)), delay(3000)]);
      if (run.appProcess.exitCode === null) {
        require('node:child_process').execFileSync('taskkill.exe', ['/PID', String(run.appProcess.pid), '/T', '/F'], { stdio: 'ignore' });
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
