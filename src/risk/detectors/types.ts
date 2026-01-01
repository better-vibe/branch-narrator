/**
 * Detector types for risk-report command.
 */

import type { ChangeSet, RiskFlag } from "../../core/types.js";

/**
 * Detector function that analyzes a changeset and returns risk flags.
 */
export type Detector = (changeSet: ChangeSet) => RiskFlag[];
