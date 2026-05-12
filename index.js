const { auto_expand_json_cols, async_stringify } = require("./common");

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "csv-io",
  contents: [
    "Provides two viewtemplates and two actions for bulk CSV import and export.",
    "",
    "Viewtemplates:",
    "- CSV Import: A standalone view that shows a file-upload button. When the user",
    "  selects a CSV file, its rows are bulk-imported into the view's table. Create one",
    "  view per table (e.g. clients_csv_import). Optional field_values_formula sets",
    "  fixed values on every imported row (e.g. {owner_id: user.id}).",
    "- CSV Export: A standalone view that shows a download button. When clicked, it",
    "  generates and downloads a CSV of the table's data. Supports an include_fml",
    "  row-filter formula, column selection, delimiter choice, and Byte Order Mark (BOM). Create one",
    "  view per table (e.g. invoices_csv_export).",
    "",
    "Actions:",
    "- import_csv_file: Row-level action. Reads a File field from the current row and",
    "  bulk-imports the file's contents into a destination table.",
    "- export_csv_to_file: Generates a CSV using a CSV Export view and saves it as a",
    "  file in the file store. Configure with the name of a CSV Export view, an",
    "  optional where formula, and a filename.",
    "",
    "For any import or export requirement, prefer the CSV Import or CSV Export",
    "viewtemplate over the actions. Use the actions only when the import or export",
    "must happen as a step inside a larger automated process.",
  ].join("\n"),
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
