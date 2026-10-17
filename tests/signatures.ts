// Method signatures copied from the contract sources the app targets (neither contract has a payable method):
//   EmergencyCircuitBreaker  https://github.com/MIKI4222/genlayer-emergency-circuit-breaker (contract.py)
//   WeatherGatedRWACustody   https://github.com/MIKI4222/genlayer-weather-gated-rwa-custody (contract.py)
export type Sig = { kind: "view" | "write"; argc: number };
const v = (argc = 0): Sig => ({ kind: "view", argc });
const w = (argc = 0): Sig => ({ kind: "write", argc });
export const BREAKER_SIG: Record<string, Sig> = {
  set_monitored_url: w(1), health_check: w(0), execute_guarded_action: w(1), emergency_unpause: w(0),
  get_status: v(), get_monitored_url: v(), get_last_verdict: v(), get_incident_count: v(), get_last_check_timestamp: v(), get_guarded_action_count: v(),
};
export const CUSTODY_SIG: Record<string, Sig> = {
  transfer_ownership: w(1), set_custodian: w(1), set_weather_url: w(1), set_challenge_period: w(1), start_cycle: w(1), propose_release: w(0),
  challenge_release: w(1), reopen_challenged_proposal: w(0), close_unsafe_cycle: w(0), finalize_release: w(0), claim_rwa_custody: w(1),
  get_status: v(), get_cycle_id: v(), get_cycle_label: v(), get_weather_url: v(), get_challenge_period: v(), get_decision: v(), get_risk: v(), get_reason: v(),
  get_source_used: v(), get_challenge_deadline: v(), get_challenge_count: v(), get_assessment_count: v(), get_completed_cycles: v(), can_finalize: v(), can_claim_custody: v(),
};
