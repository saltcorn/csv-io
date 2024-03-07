const db = require("@saltcorn/data/db");
const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const File = require("@saltcorn/data/models/file");
const {
  field_picker_fields,
  picked_fields_to_query,
  stateFieldsToWhere,
  stateFieldsToQuery,
  readState,
  initial_config_all_fields,
} = require("@saltcorn/data/plugin-helper");
const { auto_expand_json_cols, async_stringify } = require("./common");
const {
  get_viewable_fields,
} = require("@saltcorn/data/base-plugin/viewtemplates/viewable_fields");

module.exports = {
  disableInBuilder: true,
  configFields: async ({ table }) => {
    const views = View.findOne({ viewtemplate: "CSV Export" });
    return [
      {
        name: "export_view",
        label: "Export View",
        sublabel:
          "Choose a CSV Export view which will define the columns in the exported CSV file",
        type: "String",
        required: true,
        attributes: {
          options: views.map((v) => v.select_option),
        },
      },
      {
        name: "where",
        label: "Where",
        type: "String",
      },
      {
        name: "filename",
        label: "File name",
        type: "String",
      },
    ];
  },
  /**
   * @param {object} opts
   * @param {object} opts.row
   * @param {object} opts.configuration
   * @param {object} opts.user
   * @returns {Promise<void>}
   */
  run: async ({
    row,
    req,
    configuration: { export_view, where, filename },
    user,
  }) => {
    const view = View.findOne({ name: export_view });
    const table = Table.findOne({ id: view.table_id });
    const { columns, what, delimiter, bom } = view.configuration;

    const fields = await table.getFields();
    const { joinFields, aggregations } = picked_fields_to_query(
      columns,
      table.fields
    );

    const write_file = async (str) => {
      await File.from_contents(filename, "text/csv", str, user?.id);
    };

    if (what === "All columns") {
      const columns = table.fields
        .sort((a, b) => a.id - b.id)
        .map((f) => f.name);
      const rows = await table.getRows(where, { orderBy: "id" });
      auto_expand_json_cols(columns, table, rows);
      const str = await async_stringify(rows, {
        header: true,
        columns,
        bom: !!bom,
        delimiter: delimiter || ",",
        cast: {
          date: (value) => value.toISOString(),
          boolean: (v) => (v ? "true" : "false"),
        },
      });
      await write_file(str);
      return {};
    }
    let rows = await table.getJoinedRows({
      where,
      joinFields,
      aggregations,
      forPublic: !user,
      forUser: user,
    });

    const tfields = get_viewable_fields(
      view.name,
      "",
      table,
      fields,
      columns,
      false,
      req,
      req?.__ || ((s) => s)
    );

    const csvRows = rows.map((row) => {
      const csvRow = {};
      tfields.forEach(({ label, key }) => {
        csvRow[label] = typeof key === "function" ? key(row) : row[key];
      });
      return csvRow;
    });
    const str = await async_stringify(csvRows, {
      header: true,
      delimiter: delimiter || ",",
      bom: !!bom,
    });
  },
};
