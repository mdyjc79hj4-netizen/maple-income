import {requireAdmin} from './_admin-auth.js';
import {dateRangeEnding, kstDate} from './_analytics.js';
import {sendJson, sendSupportError} from './_support.js';

async function loadStats(adminClient, fromDate, toDate) {
  const {data, error} = await adminClient.from('site_daily_stats')
    .select('visit_date,unique_visitors,page_views').gte('visit_date', fromDate).lte('visit_date', toDate).order('visit_date', {ascending: true});
  if (error) throw Object.assign(new Error('방문 통계를 불러오지 못했습니다.'), {status: 500, code: 'ANALYTICS_READ_FAILED'});
  return data || [];
}

function summarizeStats(rows, today) {
  const days = dateRangeEnding(today, 31);
  const values = new Map((rows || []).map(row => [row.visit_date, {
    date: row.visit_date,
    uniqueVisitors: Math.max(0, Number(row.unique_visitors) || 0),
    pageViews: Math.max(0, Number(row.page_views) || 0)
  }]));
  const normalized = days.map(date => values.get(date) || {date, uniqueVisitors: 0, pageViews: 0});
  const last30 = normalized.slice(-30);
  const yesterday = normalized.at(-2) || {uniqueVisitors: 0};
  const current = normalized.at(-1) || {uniqueVisitors: 0, pageViews: 0};
  const last7 = normalized.slice(-7);
  const sevenDayAverage = last7.reduce((sum, row) => sum + row.uniqueVisitors, 0) / 7;
  return {
    today: {visitors: current.uniqueVisitors, pageViews: current.pageViews},
    yesterday: {visitors: yesterday.uniqueVisitors, pageViews: yesterday.pageViews || 0},
    last7DaysAverage: Math.round(sevenDayAverage * 10) / 10,
    days: last30.map(row => ({date: row.date, visitors: row.uniqueVisitors, pageViews: row.pageViews}))
  };
}

function createAdminStatsHandler(dependencies = {}) {
  const env = dependencies.env || process.env;
  return async function handler(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET 요청만 사용할 수 있습니다.'});
    try {
      const session = await (dependencies.requireAdmin || requireAdmin)(req, {...dependencies, env});
      const today = (dependencies.kstDate || kstDate)();
      const dates = dateRangeEnding(today, 31);
      const rows = await (dependencies.loadStats || loadStats)(session.adminClient, dates[0], today);
      return sendJson(res, 200, {ok: true, ...summarizeStats(rows, today)});
    } catch (error) {
      return sendSupportError(res, error, 'ADMIN_STATS_FAILED');
    }
  };
}

const handler = createAdminStatsHandler();
export default handler;
export const adminStatsInternals = {createAdminStatsHandler, loadStats, summarizeStats};
