const db = require("@saltcorn/data/db");
const Table = require("@saltcorn/data/models/table");
const File = require("@saltcorn/data/models/file");

module.exports = {
  requireRow: true,
  configFields: async ({ table }) => {
    const tables = await Table.find();
    const file_fields = table.fields.filter((f) => f.type === "File");
    return [
      {
        name: "table_dest",
        label: "Destination table",
        sublabel: "Table to sync to",
        input_type: "select",
        required: true,

        options: tables.map((t) => t.name),
      },
      {
        name: "file_field",
        label: "File field",
        type: "String",
        required: true,
        attributes: {
          options: file_fields.map((f) => f.name),
        },
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
  run: async ({ row, configuration: { table_dest, file_field } }) => {
    if (!row?.[file_field]) return;
    const file = await File.findOne({ filename: row[file_field] });
    const result = await Table.import_csv_file(file.location);
    if (result.error) return { error: result.error };
    else return { notify: result.sucess };
  },
};
