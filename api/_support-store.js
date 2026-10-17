const TICKETS = 'support_tickets';
const REPLIES = 'support_replies';

function databaseError(message, code = 'SUPPORT_DATABASE_FAILED') {
  return Object.assign(new Error(message), {status: 500, code});
}

function resultData(result, message) {
  if (result?.error) throw databaseError(message);
  return result?.data;
}

function createSupportStore(adminClient) {
  return {
    async listPublic() {
      return resultData(await adminClient.from(TICKETS)
        .select('id,category,title,status,created_at,updated_at')
        .eq('is_private', false).order('created_at', {ascending: false}).limit(100), '공개 문의를 불러오지 못했습니다.') || [];
    },
    async listMine(userId) {
      return resultData(await adminClient.from(TICKETS)
        .select('id,category,title,status,is_private,created_at,updated_at')
        .eq('user_id', userId).order('created_at', {ascending: false}).limit(100), '내 문의를 불러오지 못했습니다.') || [];
    },
    async listAdmin({status = '', category = '', privacy = ''} = {}) {
      let query = adminClient.from(TICKETS)
        .select('id,category,title,status,is_private,created_at,updated_at,user_id')
        .order('updated_at', {ascending: false}).limit(200);
      if (status) query = query.eq('status', status);
      if (category) query = query.eq('category', category);
      if (privacy === 'private') query = query.eq('is_private', true);
      if (privacy === 'public') query = query.eq('is_private', false);
      return resultData(await query, '문의 목록을 불러오지 못했습니다.') || [];
    },
    async getTicket(id) {
      return resultData(await adminClient.from(TICKETS).select('*').eq('id', id).maybeSingle(), '문의를 불러오지 못했습니다.') || null;
    },
    async listReplies(ticketId) {
      return resultData(await adminClient.from(REPLIES).select('*').eq('ticket_id', ticketId).order('created_at', {ascending: true}), '답변을 불러오지 못했습니다.') || [];
    },
    async countRecentTickets(userId, since) {
      const result = await adminClient.from(TICKETS).select('id', {count: 'exact', head: true}).eq('user_id', userId).gte('created_at', since);
      if (result?.error) throw databaseError('문의 작성 횟수를 확인하지 못했습니다.');
      return Number(result.count) || 0;
    },
    async countRecentReplies(userId, since) {
      const result = await adminClient.from(REPLIES).select('id', {count: 'exact', head: true}).eq('author_user_id', userId).gte('created_at', since);
      if (result?.error) throw databaseError('답변 작성 횟수를 확인하지 못했습니다.');
      return Number(result.count) || 0;
    },
    async insertTicket(row) {
      return resultData(await adminClient.from(TICKETS).insert(row).select('*').single(), '문의를 등록하지 못했습니다.');
    },
    async insertReply(row) {
      return resultData(await adminClient.from(REPLIES).insert(row).select('*').single(), '답변을 등록하지 못했습니다.');
    },
    async updateTicketStatus(id, status) {
      return resultData(await adminClient.from(TICKETS).update({status, updated_at: new Date().toISOString()}).eq('id', id).select('*').single(), '문의 상태를 변경하지 못했습니다.');
    },
    async deleteTicket(id) {
      const result = await adminClient.from(TICKETS).delete().eq('id', id);
      if (result?.error) throw databaseError('문의를 삭제하지 못했습니다.');
      return true;
    }
  };
}

export {REPLIES, TICKETS, createSupportStore};
