export type { IDrillDataSource } from "./IDrillDataSource";
export { ApiDrillDataSource } from "./ApiDrillDataSource";
export { MockDrillDataSource } from "./MockDrillDataSource";

import { ApiDrillDataSource } from "./ApiDrillDataSource";

export const drillDataSource = new ApiDrillDataSource();
// Swap to MockDrillDataSource for offline development:
// import { MockDrillDataSource } from "./MockDrillDataSource";
// export const drillDataSource = new MockDrillDataSource();
