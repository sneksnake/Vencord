/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { WebpackInstance } from "discord-types/other";

import { proxyLazy } from "../utils/proxyLazy";

export let _resolveReady: () => void;
/**
 * Fired once a gateway connection to Discord has been established.
 * This indicates that the core webpack modules have been initialised
 */
export const onceReady = new Promise<void>(r => _resolveReady = r);

export let wreq: WebpackInstance;
export let cache: WebpackInstance["c"];

export type FilterFn = (mod: any) => boolean;

export const filters = {
    byProps: (props: string[]): FilterFn =>
        props.length === 1
            ? m => m[props[0]] !== void 0
            : m => props.every(p => m[p] !== void 0),
    byDisplayName: (deezNuts: string): FilterFn => m => m.default?.displayName === deezNuts,
    byCode: (...code: string[]): FilterFn => m => {
        if (typeof m !== "function") return false;
        const s = Function.prototype.toString.call(m);
        for (const c of code) {
            if (!s.includes(c)) return false;
        }
        return true;
    },
};

export const subscriptions = new Map<FilterFn, CallbackFn>();
export const listeners = new Set<CallbackFn>();

export type CallbackFn = (mod: any) => void;

export function _initWebpack(instance: typeof window.webpackChunkdiscord_app) {
    if (cache !== void 0) throw "no.";

    wreq = instance.push([[Symbol()], {}, r => r]);
    cache = wreq.c;
    instance.pop();
}

export function find(filter: FilterFn, getDefault = true) {
    if (typeof filter !== "function")
        throw new Error("Invalid filter. Expected a function got " + typeof filter);

    for (const key in cache) {
        const mod = cache[key];
        if (!mod?.exports) continue;

        if (filter(mod.exports))
            return mod.exports;

        if (typeof mod.exports !== "object") continue;

        if (mod.exports.default && filter(mod.exports.default))
            return getDefault ? mod.exports.default : mod.exports;

        // is 3 is the longest obfuscated export?
        // the length check makes search about 20% faster
        for (const nestedMod in mod.exports) if (nestedMod.length <= 3) {
            const nested = mod.exports[nestedMod];
            if (nested && filter(nested)) return nested;
        }
    }

    return null;
}

export function findAll(filter: FilterFn, getDefault = true) {
    if (typeof filter !== "function") throw new Error("Invalid filter. Expected a function got " + typeof filter);

    const ret = [] as any[];
    for (const key in cache) {
        const mod = cache[key];
        if (!mod?.exports) continue;

        if (filter(mod.exports))
            ret.push(mod.exports);
        else if (typeof mod.exports !== "object")
            continue;

        if (mod.exports.default && filter(mod.exports.default))
            ret.push(getDefault ? mod.exports.default : mod.exports);
        else for (const nestedMod in mod.exports) if (nestedMod.length <= 3) {
            const nested = mod.exports[nestedMod];
            if (nested && filter(nested)) ret.push(nested);
        }
    }

    return ret;
}

/**
 * Finds a mangled module by the provided code "code" (must be unique and can be anywhere in the module)
 * then maps it into an easily usable module via the specified mappers
 * @param code Code snippet
 * @param mappers Mappers to create the non mangled exports
 * @returns Unmangled exports as specified in mappers
 *
 * @example mapMangledModule("headerIdIsManaged:", {
 *             openModal: filters.byCode("headerIdIsManaged:"),
 *             closeModal: filters.byCode("key==")
 *          })
 */
export function mapMangledModule<S extends string>(code: string, mappers: Record<S, FilterFn>): Record<S, any> {
    const exports = {} as Record<S, any>;

    // search every factory function
    for (const id in wreq.m) {
        const src = wreq.m[id].toString() as string;
        if (src.includes(code)) {
            const mod = wreq(id as any as number);
            outer:
            for (const key in mod) {
                const member = mod[key];
                for (const newName in mappers) {
                    // if the current mapper matches this module
                    if (mappers[newName](member)) {
                        exports[newName] = member;
                        continue outer;
                    }
                }
            }
            break;
        }
    }

    return exports;
}

/**
 * Same as {@link mapMangledModule} but lazy
 */
export function mapMangledModuleLazy<S extends string>(code: string, mappers: Record<S, FilterFn>): Record<S, any> {
    return proxyLazy(() => mapMangledModule(code, mappers));
}

export function findByProps(...props: string[]) {
    return find(filters.byProps(props));
}

export function findAllByProps(...props: string[]) {
    return findAll(filters.byProps(props));
}

export function findByDisplayName(deezNuts: string) {
    return find(filters.byDisplayName(deezNuts));
}

export function waitFor(filter: string | string[] | FilterFn, callback: CallbackFn) {
    if (typeof filter === "string") filter = filters.byProps([filter]);
    else if (Array.isArray(filter)) filter = filters.byProps(filter);
    else if (typeof filter !== "function") throw new Error("filter must be a string, string[] or function, got " + typeof filter);

    const existing = find(filter!);
    if (existing) return void callback(existing);

    subscriptions.set(filter, callback);
}

export function addListener(callback: CallbackFn) {
    listeners.add(callback);
}

export function removeListener(callback: CallbackFn) {
    listeners.delete(callback);
}

/**
 * Search modules by keyword. This searches the factory methods,
 * meaning you can search all sorts of things, displayName, methodName, strings somewhere in the code, etc
 * @param filters One or more strings or regexes
 * @returns Mapping of found modules
 */
export function search(...filters: Array<string | RegExp>) {
    const results = {} as Record<number, Function>;
    const factories = wreq.m;
    outer:
    for (const id in factories) {
        const factory = factories[id].original ?? factories[id];
        const str: string = factory.toString();
        for (const filter of filters) {
            if (typeof filter === "string" && !str.includes(filter)) continue outer;
            if (filter instanceof RegExp && !filter.test(str)) continue outer;
        }
        results[id] = factory;
    }

    return results;
}

/**
 * Extract a specific module by id into its own Source File. This has no effect on
 * the code, it is only useful to be able to look at a specific module without having
 * to view a massive file. extract then returns the extracted module so you can jump to it.
 * As mentioned above, note that this extracted module is not actually used,
 * so putting breakpoints or similar will have no effect.
 * @param id The id of the module to extract
 */
export function extract(id: number) {
    const mod = wreq.m[id] as Function;
    if (!mod) return null;

    const code = `
// [EXTRACTED] WebpackModule${id}
// WARNING: This module was extracted to be more easily readable.
//          This module is NOT ACTUALLY USED! This means putting breakpoints will have NO EFFECT!!

${mod.toString()}
//# sourceURL=ExtractedWebpackModule${id}
`;
    const extracted = (0, eval)(code);
    return extracted as Function;
}
