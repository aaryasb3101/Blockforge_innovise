export * from '../../shared/types.js';

import { ReasonCode } from '../../shared/types.js';

export const ReasonName: Record<number, string> = {
  [ReasonCode.Superseded]: 'Superseded',
  [ReasonCode.Fraud]: 'Fraud',
  [ReasonCode.Error]: 'Error',
  [ReasonCode.KeyCompromise]: 'KeyCompromise',
  [ReasonCode.Other]: 'Other',
};

export interface VerifyOptions {
  nonce?: string;
  asOfTimestamp?: number;
  now?: number;
}
