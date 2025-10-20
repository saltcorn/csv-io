const { auto_expand_json_cols, async_stringify } = require("./common");

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "csv-io",
  viewtemplates: [require("./export_view"), require("./import_view")],
  testString: "testing",
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
