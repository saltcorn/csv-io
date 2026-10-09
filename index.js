const fs = require("fs");
const { auto_expand_json_cols, async_stringify } = require("./common");
const appConstructorRules = require("./app-constructor-rules");

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "csv-io",
  app_constructor_rules: appConstructorRules.join("\n"),
  viewtemplates: [require("./export_view"), require("./import_view")],
  testString: "testing",
  importers: {
    JSON: {
      extensions: [".json"],
      mimetypes: ["application/json"],
      async parse(filePath, { limit }) {
        const data = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
        if (!Array.isArray(data))
          return { error: "JSON file must contain an array of objects" };
        return { rows: limit ? data.slice(0, limit) : data };
      },
    },
  },
  exporters: {
    JSON: {
      extension: ".json",
      mimetype: "application/json",
      async export({ rows }) {
        return JSON.stringify(rows, null, 2);
      },
    },
  },
  actions: {
    import_csv_file: require("./import-file-action"),
    export_csv_to_file: require("./export-file-action"),
  },
  functions: {
    json_to_csv: {
      async run(json_list) {
        if (!json_list || !json_list.length) return "";
        const columns = Object.keys(json_list[0]);
        const str = await async_stringify(json_list, {
          header: true,
          columns,
          delimiter: ",",
          cast: {
            date: (value) => value.toISOString(),
            boolean: (v) => (v ? "true" : "false"),
          },
        });
        return str;
      },
      description: "Convert a list of JSON objects to a CSV string",
      isAsync: true,
      arguments: [{ name: "json_list", type: "JSON" }],
    },
  },
};
