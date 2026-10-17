import {authenticateRequest, createAdminClient} from './_nexon-credential-store.js';
import {isAdminUser} from './_admin-auth.js';
import {createSupportStore} from './_support-store.js';
import {normalizeReplyInput, publicError, requestBody, sendJson, sendSupportError} from './_support.js';

function createSupportRepliesHandler(dependencies = {}) {
  const env = dependencies.env || process.env;
  return async function handler(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'POST 요청만 사용할 수 있습니다.'});
    try {
      const adminClient = dependencies.adminClient || (dependencies.createAdminClient || createAdminClient)(env);
      const user = await (dependencies.authenticateRequest || authenticateRequest)(req, adminClient);
      const store = dependencies.store || createSupportStore(adminClient);
      const input = normalizeReplyInput(requestBody(req));
      const ticket = await store.getTicket(input.ticketId);
      if (!ticket) throw publicError(404, 'TICKET_NOT_FOUND', '문의를 찾을 수 없습니다.');
      const admin = isAdminUser(user, env);
      if (!admin && ticket.user_id !== user.id) throw publicError(403, 'FORBIDDEN', '이 문의에 답변할 권한이 없습니다.');
      if (ticket.status === 'closed' && !admin) throw publicError(409, 'TICKET_CLOSED', '종료된 문의에는 답변을 추가할 수 없습니다.');
      if (!admin) {
        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        if (await store.countRecentReplies(user.id, since) >= 20) throw publicError(429, 'RATE_LIMITED', '답변은 한 시간에 20개까지 등록할 수 있습니다.');
      }
      const reply = await store.insertReply({ticket_id: ticket.id, author_user_id: user.id, author_role: admin ? 'admin' : 'user', content: input.content});
      const updated = await store.updateTicketStatus(ticket.id, admin ? 'answered' : 'pending');
      return sendJson(res, 201, {ok: true, ticketId: updated.id, status: updated.status, reply: {id: reply.id, authorRole: admin ? 'admin' : 'user', content: reply.content, createdAt: reply.created_at}});
    } catch (error) {
      return sendSupportError(res, error);
    }
  };
}

const handler = createSupportRepliesHandler();
export default handler;
export const supportRepliesInternals = {createSupportRepliesHandler};
