import {requireAdmin} from './_admin-auth.js';
import {createSupportStore} from './_support-store.js';
import {
  SUPPORT_CATEGORIES, SUPPORT_STATUSES, normalizeUuid, publicError, requestBody, requestQuery,
  sendJson, sendSupportError, singleQueryValue, ticketDetail, ticketSummary
} from './_support.js';

function createAdminSupportHandler(dependencies = {}) {
  const env = dependencies.env || process.env;
  return async function handler(req, res) {
    if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) return sendJson(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET, PATCH, DELETE 요청만 사용할 수 있습니다.'});
    try {
      const session = await (dependencies.requireAdmin || requireAdmin)(req, {...dependencies, env});
      const store = dependencies.store || createSupportStore(session.adminClient);
      const query = requestQuery(req);
      if (req.method === 'GET') {
        const id = singleQueryValue(query.id);
        if (id) {
          const ticket = await store.getTicket(normalizeUuid(id));
          if (!ticket) throw publicError(404, 'TICKET_NOT_FOUND', '문의를 찾을 수 없습니다.');
          return sendJson(res, 200, {ok: true, ticket: ticketDetail(ticket, await store.listReplies(ticket.id), {canReply: true, canDelete: true, canManage: true})});
        }
        const status = String(singleQueryValue(query.status) || '');
        const category = String(singleQueryValue(query.category) || '');
        const privacy = String(singleQueryValue(query.privacy) || '');
        if (status && !SUPPORT_STATUSES.includes(status)) throw publicError(400, 'INVALID_REQUEST', '문의 상태를 확인해주세요.');
        if (category && !SUPPORT_CATEGORIES.includes(category)) throw publicError(400, 'INVALID_REQUEST', '문의 유형을 확인해주세요.');
        if (privacy && !['public', 'private'].includes(privacy)) throw publicError(400, 'INVALID_REQUEST', '문의 공개 범위를 확인해주세요.');
        return sendJson(res, 200, {ok: true, tickets: (await store.listAdmin({status, category, privacy})).map(ticketSummary)});
      }
      const body = requestBody(req);
      const id = normalizeUuid(singleQueryValue(query.id) || body.id);
      const ticket = await store.getTicket(id);
      if (!ticket) throw publicError(404, 'TICKET_NOT_FOUND', '문의를 찾을 수 없습니다.');
      if (req.method === 'DELETE') {
        await store.deleteTicket(id);
        return sendJson(res, 200, {ok: true});
      }
      const status = String(body.status || '');
      if (!SUPPORT_STATUSES.includes(status)) throw publicError(400, 'INVALID_REQUEST', '문의 상태를 확인해주세요.');
      const updated = await store.updateTicketStatus(id, status);
      return sendJson(res, 200, {ok: true, ticket: ticketSummary(updated)});
    } catch (error) {
      return sendSupportError(res, error, 'ADMIN_SUPPORT_FAILED');
    }
  };
}

const handler = createAdminSupportHandler();
export default handler;
export const adminSupportInternals = {createAdminSupportHandler};
