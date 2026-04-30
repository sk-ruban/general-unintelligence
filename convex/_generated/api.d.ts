/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as dam from "../dam.js";
import type * as damSummary from "../damSummary.js";
import type * as eex from "../eex.js";
import type * as http from "../http.js";
import type * as httpShared from "../httpShared.js";
import type * as iceTtf from "../iceTtf.js";
import type * as maintenance from "../maintenance.js";
import type * as openMeteo from "../openMeteo.js";
import type * as signalScoring from "../signalScoring.js";
import type * as userState from "../userState.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  dam: typeof dam;
  damSummary: typeof damSummary;
  eex: typeof eex;
  http: typeof http;
  httpShared: typeof httpShared;
  iceTtf: typeof iceTtf;
  maintenance: typeof maintenance;
  openMeteo: typeof openMeteo;
  signalScoring: typeof signalScoring;
  userState: typeof userState;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
