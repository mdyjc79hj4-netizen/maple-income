import {authenticateRequest, createAdminClient} from './_nexon-credential-store.js';
import {isAdminUser, optionalAuthenticatedUser} from './_admin-auth.js';
import {createSupportStore} from './_support-store.js';
import {
  normalizeTicketInput, normalizeUuid, publicError, publicTicketSummary, requestBody, requestQuery, sendJson,
  sendSupportError, singleQueryValue, ticketDetail, ticketSummary
} from './_support.js';

function createSupportTicketsHandler(dependencies = {}) {
  const env = dependencies.env || process.env;
  return async function handler(req, res) {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) return sendJson(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET, POST, DELETE 요청만 사용할 수 있습니다.'});
    try {
      const adminClient = dependencies.adminClient || (dependencies.createAdminClient || createAdminClient)(env);
      const store = dependencies.store || createSupportStore(adminClient);
      const authenticate = dependencies.authenticateRequest || authenticateRequest;
      const optionalUser = await optionalAuthenticatedUser(req, adminClient, authenticate);
      const admin = isAdminUser(optionalUser, env);
      if (req.method === 'GET') {
        const query = requestQuery(req);
        const id = singleQueryValue(query.id);
        if (id) {
          const ticket = await store.getTicket(normalizeUuid(id));
          if (!ticket) throw publicError(404, 'TICKET_NOT_FOUND', '문의를 찾을 수 없습니다.');
          const owner = !!optionalUser && ticket.user_id === optionalUser.id;
          if (ticket.is_private && !owner && !admin) throw publicError(404, 'TICKET_NOT_FOUND', '문의를 찾을 수 없습니다.');
          const replies = await store.listReplies(ticket.id);
          return sendJson(res, 200, {ok: true, ticket: ticketDetail(ticket, replies, {canReply: owner || admin, canDelete: owner || admin, canManage: admin})});
        }
        const scope = singleQueryValue(query.scope) || 'public';
        if (scope === 'mine') {
          if (!optionalUser) throw publicError(401, 'AUTH_REQUIRED', '내 문의는 로그인 후 확인할 수 있습니다.');
          return sendJson(res, 200, {ok: true, tickets: (await store.listMine(optionalUser.id)).map(ticketSummary)});
        }
        if (scope !== 'public') throw publicError(400, 'INVALID_REQUEST', '문의 목록 범위를 확인해주세요.');
        return sendJson(res, 200, {ok: true, tickets: (await store.listPublic()).map(publicTicketSummary)});
      }
      const user = optionalUser || await authenticate(req, adminClient);
      if (req.method === 'POST') {
        const input = normalizeTicketInput(requestBody(req));
        if (!isAdminUser(user, env)) {
          const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          if (await store.countRecentTickets(user.id, since) >= 5) throw publicError(429, 'RATE_LIMITED', '문의는 한 시간에 5개까지 등록할 수 있습니다.');
        }
        const ticket = await store.insertTicket({user_id: user.id, category: input.category, title: input.title, content: input.content, is_private: input.isPrivate, status: 'pending'});
        return sendJson(res, 201, {ok: true, ticket: ticketDetail(ticket, [], {canReply: true, canDelete: true, canManage: isAdminUser(user, env)})});
      }
      const id = normalizeUuid(singleQueryValue(requestQuery(req).id) || requestBody(req).id);
      const ticket = await store.getTicket(id);
      if (!ticket) throw publicError(404, 'TICKET_NOT_FOUND', '문의를 찾을 수 없습니다.');
      if (ticket.user_id !== user.id && !isAdminUser(user, env)) throw publicError(403, 'FORBIDDEN', '이 문의를 삭제할 권한이 없습니다.');
      await store.deleteTicket(id);
      return sendJson(res, 200, {ok: true});
    } catch (error) {
      return sendSupportError(res, error);
    }
  };
}

const handler = createSupportTicketsHandler();
export default handler;
export const supportTicketsInternals = {createSupportTicketsHandler};
