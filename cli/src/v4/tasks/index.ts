import type { V4Task } from '../types.js';
import { agentReturns } from './agent.js';
import { codeMergeIntervals } from './code.js';
import { fncallAbstain, fncallParallelNested } from './fncall.js';
import { instructProductCopy } from './instruct.js';
import { longdocTwoHop } from './longdoc.js';
import { reasonTank } from './reason.js';
import { repoTieredPricing } from './repo.js';

export const TESTPACK_V4_VERSION = '4.0.0-alpha.1';

export const V4_TASKS: V4Task[] = [
  codeMergeIntervals,
  repoTieredPricing,
  agentReturns,
  fncallParallelNested,
  fncallAbstain,
  reasonTank,
  longdocTwoHop,
  instructProductCopy,
];
