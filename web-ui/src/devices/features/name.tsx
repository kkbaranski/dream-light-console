import { readField, type FeatureDef } from "../feature";

export interface NameConfig {
  defaultName: string;
}

export const name: FeatureDef<NameConfig> = {
  type: "name",

  defaultState: (config) => ({ name: config.defaultName }),

  Inspector: ({ ctx }) => {
    const value = ctx.shared((obj) => readField<string>(obj, "name", "")) ?? "";
    const isMixed = ctx.isMixed((obj) => readField<string>(obj, "name", ""));
    return (
      <input
        type="text"
        value={value}
        placeholder={isMixed ? "Multiple values" : "Name"}
        onChange={(event) => ctx.update({ name: event.target.value })}
        className="w-full bg-gray-800 text-xs text-gray-200 rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 outline-none placeholder:text-gray-600"
      />
    );
  },
};
