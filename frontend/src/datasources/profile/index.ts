export type { IProfileDataSource } from "./IProfileDataSource";
export { ApiProfileDataSource } from "./ApiProfileDataSource";
export { MockProfileDataSource } from "./MockProfileDataSource";

import { ApiProfileDataSource } from "./ApiProfileDataSource";

// Swap to MockProfileDataSource for offline development:
// import { MockProfileDataSource } from "./MockProfileDataSource";
// export const profileDataSource = new MockProfileDataSource();

export const profileDataSource = new ApiProfileDataSource();
