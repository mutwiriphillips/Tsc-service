const { z } = require('zod');

const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

function paging(query) {
  const { page, pageSize } = pagingSchema.parse({ page: query.page, pageSize: query.pageSize });
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

const pageResult = (items, total, { page, pageSize }) => ({ items, total, page, pageSize, pages: Math.ceil(total / pageSize) });

module.exports = { paging, pageResult };
