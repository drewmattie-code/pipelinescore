import type { Request } from 'express';

/**
 * v3 and v4 are different tests on different scales (gpt-oss-20b: ~93 on v3, ~67 on v4), so a
 * board never mixes them. Every query over `submissions` takes this clause.
 *
 * `?testpack=v3|v4` picks a board explicitly; otherwise DEFAULT_TESTPACK decides. It defaults to
 * v3 so shipping this code changes nothing for visitors; launching v4 is flipping the env var.
 */
export type Board = 'v3' | 'v4';

export function defaultBoard(): Board {
  return process.env.DEFAULT_TESTPACK === 'v4' ? 'v4' : 'v3';
}

export function boardFor(req: Pick<Request, 'query'>): Board {
  const q = req.query.testpack;
  return q === 'v3' || q === 'v4' ? q : defaultBoard();
}

/** A WHERE fragment on the submissions table, aliased or not (`s.` prefix optional). */
export function testpackClause(board: Board, alias = 's'): string {
  const col = alias ? `${alias}.testpack_version` : 'testpack_version';
  return board === 'v4' ? `${col} LIKE '4.%'` : `${col} NOT LIKE '4.%'`;
}
