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

import { OptionType, PluginOptionNumber } from "../../../utils/types";
import { Forms, React, TextInput } from "../../../webpack/common";
import { ISettingElementProps } from ".";

const MAX_SAFE_NUMBER = BigInt(Number.MAX_SAFE_INTEGER);

export function SettingNumericComponent({ option, pluginSettings, id, onChange, onError }: ISettingElementProps<PluginOptionNumber>) {
    function serialize(value: any) {
        if (option.type === OptionType.BIGINT) return BigInt(value);
        return Number(value);
    }

    const [state, setState] = React.useState<any>(`${pluginSettings[id] ?? option.default ?? 0}`);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        onError(error !== null);
    }, [error]);

    function handleChange(newValue) {
        const isValid = (option.isValid && option.isValid(newValue)) ?? true;
        if (typeof isValid === "string") setError(isValid);
        else if (!isValid) setError("Invalid input provided.");
        else if (option.type === OptionType.NUMBER && BigInt(newValue) >= MAX_SAFE_NUMBER) {
            setState(`${Number.MAX_SAFE_INTEGER}`);
            onChange(serialize(newValue));
        } else {
            setState(newValue);
            onChange(serialize(newValue));
        }
    }

    return (
        <Forms.FormSection>
            <Forms.FormTitle>{option.description}</Forms.FormTitle>
            <TextInput
                type="number"
                pattern="-?[0-9]+"
                value={state}
                onChange={handleChange}
                placeholder={option.placeholder ?? "Enter a number"}
                disabled={option.disabled?.() ?? false}
                {...option.componentProps}
            />
            {error && <Forms.FormText style={{ color: "var(--text-danger)" }}>{error}</Forms.FormText>}
        </Forms.FormSection>
    );
}
