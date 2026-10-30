import type { V4Task } from '../types.js';
import { AGENT_TASKS } from './agent.js';
import { CODE_TASKS } from './code.js';
import { COMPUTE_TASKS } from './compute.js';
import { FNCALL_TASKS } from './fncall.js';
import { INSTRUCT_TASKS } from './instruct.js';
import { LONGDOC_TASKS } from './longdoc.js';
import { REASON_TASKS } from './reason.js';
import { REPO_TASKS } from './repo.js';

export const TESTPACK_V4_VERSION = '4.1.0-alpha.1';

export const V4_TASKS: V4Task[] = [
  ...CODE_TASKS,
  ...REPO_TASKS,
  ...AGENT_TASKS,
  ...FNCALL_TASKS,
  ...REASON_TASKS,
  ...LONGDOC_TASKS,
  ...INSTRUCT_TASKS,
  ...COMPUTE_TASKS,
];
