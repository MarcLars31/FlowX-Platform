import type { ProductIntent as AhlsellProductIntent } from "./product-classification";
export { inferProductIntent as ahlsellRequirementIntent } from "./product-classification";
export type { ProductIntent as AhlsellProductIntent } from "./product-classification";

export function catalogTypesForIntent(intent: AhlsellProductIntent): readonly string[] | null {
  const types: Partial<Record<AhlsellProductIntent, string[]>> = {
    wet_alarm_valve: ["alarm_valve_station"], dry_alarm_valve: ["alarm_valve_station"],
    sprinkler_guard: ["sprinkler_accessory"], sprinkler_cabinet: ["sprinkler_accessory"],
    cap: ["end_cap"], branch: ["branch_outlet"], flanged_bend: ["bend"],
    reducer: ["reducer", "reducer_coupling"], tee: ["tee", "sprinkler_tee"],
    equipment_connection: ["coupling", "reducer", "reducer_coupling", "flange_adapter", "fitting"],
    shutoff_valve: ["butterfly_valve", "ball_valve", "gate_valve"], support: ["support_bracket"],
    test_drain: ["test_drain"], sensor_pocket: ["sensor_pocket"], water_meter: ["water_meter"],
    flushing_connection: ["butterfly_valve", "ball_valve", "valve"],
    alarm_device: ["alarm_device", "pressure_switch"], flow_meter: ["flow_meter"],
    manometer: ["manometer"], pump: ["pump"], strainer: ["strainer"]
  };
  return intent === "generic" || intent === "custom_fabrication" ? null : types[intent] ?? [intent];
}
