"use client";

import { useState, useMemo } from "react";
import Dropzone, { DropzoneState } from "shadcn-dropzone";
import Papa, { ParseResult } from "papaparse";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnResizeMode,
} from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  BarChart,
  Bar,
  XAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Calendar as CalendarIcon } from "lucide-react";
import React from "react";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDownIcon } from "lucide-react";

interface MergedRow {
  date: string;
  description: string;
  amount: string;
  source: string;
}

function parseDate(dateStr: string) {
  // Try MM/DD/YYYY or similar
  const [m, d, y] = dateStr.split(/[\/-]/);
  if (m && d && y)
    return new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  return new Date(dateStr);
}

function getMonthShorts() {
  return [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
}

function getBarChartData(rows: MergedRow[]) {
  const months = getMonthShorts();
  const data = months.map((month) => ({
    month,
    positive: 0,
    negative: 0,
  }));
  rows.forEach((row) => {
    const d = parseDate(row.date);
    const monthIdx = d.getMonth();
    const amt = parseFloat(row.amount);
    if (amt > 0) data[monthIdx].positive += amt;
    if (amt < 0) data[monthIdx].negative += amt;
  });
  return data;
}

function formatDate(date: Date | undefined) {
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function isValidDate(date: Date | undefined) {
  if (!date) return false;
  return !isNaN(date.getTime());
}

function ShadcnDatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState<Date | undefined>(
    value ? new Date(value) : undefined
  );
  const [month, setMonth] = React.useState<Date | undefined>(date);
  const [inputValue, setInputValue] = React.useState(formatDate(date));

  React.useEffect(() => {
    setDate(value ? new Date(value) : undefined);
    setInputValue(formatDate(value ? new Date(value) : undefined));
  }, [value]);

  return (
    <div className="flex flex-col gap-1 w-44">
      <Label htmlFor={label} className="px-1">
        {label}
      </Label>
      <div className="relative flex gap-2">
        <Input
          id={label}
          value={inputValue}
          placeholder="Month DD, YYYY"
          className="bg-background pr-10"
          onChange={(e) => {
            const d = new Date(e.target.value);
            setInputValue(e.target.value);
            if (isValidDate(d)) {
              setDate(d);
              setMonth(d);
              onChange(d.toISOString().slice(0, 10));
            } else {
              onChange("");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id="date-picker"
              variant="ghost"
              className="absolute top-1/2 right-2 size-6 -translate-y-1/2"
              tabIndex={-1}
            >
              <CalendarIcon className="size-3.5" />
              <span className="sr-only">Select date</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto overflow-hidden p-0"
            align="end"
            alignOffset={-8}
            sideOffset={10}
          >
            <Calendar
              mode="single"
              selected={date}
              captionLayout="dropdown"
              month={month}
              onMonthChange={setMonth}
              onSelect={(d) => {
                setDate(d);
                setInputValue(formatDate(d));
                setOpen(false);
                onChange(d ? d.toISOString().slice(0, 10) : "");
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function removeCreditCardPaymentPairs(
  rows: MergedRow[],
  files: File[],
  enabled: boolean
) {
  if (!enabled || files.length < 2) return rows;
  // Heuristic: find negative amounts in checking, positive in credit card, similar value and close date
  const checkingFiles = files.filter((f) => /checking/i.test(f.name));
  const creditFiles = files.filter((f) => /credit/i.test(f.name));
  if (!checkingFiles.length || !creditFiles.length) return rows;
  const tolerance = 1.0; // $1
  const maxDays = 3;
  const used = new Set<number>();
  const filtered: boolean[] = Array(rows.length).fill(false);
  for (let i = 0; i < rows.length; ++i) {
    const rowA = rows[i];
    if (!checkingFiles.some((f) => f.name === rowA.source)) continue;
    const amtA = parseFloat(rowA.amount);
    if (amtA >= 0) continue;
    const dateA = parseDate(rowA.date);
    for (let j = 0; j < rows.length; ++j) {
      if (i === j || used.has(j)) continue;
      const rowB = rows[j];
      if (!creditFiles.some((f) => f.name === rowB.source)) continue;
      const amtB = parseFloat(rowB.amount);
      if (amtB <= 0) continue;
      const dateB = parseDate(rowB.date);
      if (
        Math.abs(Math.abs(amtA) - amtB) <= tolerance &&
        Math.abs(dateA.getTime() - dateB.getTime()) <= maxDays * 86400000
      ) {
        // Remove both
        filtered[i] = true;
        filtered[j] = true;
        used.add(j);
        break;
      }
    }
  }
  return rows.filter((_, idx) => !filtered[idx]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <Card className="shadow-md">
      <CardContent className="p-4">
        <div className="font-semibold text-lg mb-2">{label}</div>
        <div className="text-green-600 font-semibold mb-1">
          + :{" "}
          {`$${Number(data.positive || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
        </div>
        <div className="text-red-600 font-semibold">
          - :{" "}
          {`-$${Math.abs(Number(data.negative || 0)).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [mergedRows, setMergedRows] = useState<MergedRow[]>([]);
  const [showChips, setShowChips] = useState(false);
  const [showDropzone, setShowDropzone] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnResizeMode] = useState<ColumnResizeMode>("onChange");
  const [search, setSearch] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [removePayments, setRemovePayments] = useState(false);
  const [searchColumns, setSearchColumns] = useState<string[]>([]);
  const isAllColumns = searchColumns.length === 0;

  const handleDrop = async (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
    setShowChips(false);
    const allRows: MergedRow[] = [];

    await Promise.all(
      acceptedFiles.map(
        (file) =>
          new Promise<void>((resolve) => {
            Papa.parse(file, {
              header: true,
              skipEmptyLines: true,
              complete: (result: ParseResult<Record<string, string>>) => {
                const rows = result.data;
                rows.forEach((row) => {
                  // Use Posting Date or Transaction Date, ignore Post Date
                  const date =
                    row["Posting Date"] ||
                    row["Transaction Date"] ||
                    row["Date"] ||
                    "";
                  const description = row["Description"] || "";
                  const amount = row["Amount"] || "";
                  if (date && description && amount) {
                    allRows.push({
                      date,
                      description,
                      amount,
                      source: file.name,
                    });
                  }
                });
                resolve();
              },
            });
          })
      )
    );
    setMergedRows(allRows);
    setTimeout(() => {
      setShowChips(true);
      setShowDropzone(false);
    }, 100);
  };

  // Filtered rows by date and search, and remove payment pairs if toggle is on
  const filteredRows = useMemo(() => {
    let rows = mergedRows.filter((row) => {
      // Date filter
      let inDateRange = true;
      if (dateStart) {
        const rowDate = parseDate(row.date);
        const start = new Date(dateStart);
        if (rowDate < start) inDateRange = false;
      }
      if (dateEnd) {
        const rowDate = parseDate(row.date);
        const end = new Date(dateEnd);
        if (rowDate > end) inDateRange = false;
      }
      // Search filter
      const searchLower = search.toLowerCase();
      let matchesSearch = true;
      if (searchLower) {
        if (isAllColumns) {
          matchesSearch = Object.values(row).some((v) =>
            v.toLowerCase().includes(searchLower)
          );
        } else {
          matchesSearch = searchColumns.some((col) =>
            row[col as keyof MergedRow]?.toLowerCase().includes(searchLower)
          );
        }
      }
      return inDateRange && matchesSearch;
    });
    rows = removeCreditCardPaymentPairs(rows, files, removePayments);

    return rows;
  }, [
    mergedRows,
    dateStart,
    dateEnd,
    search,
    removePayments,
    files,
    searchColumns,
    isAllColumns,
  ]);

  // Table columns with sorting and resizing
  const allColumns: ColumnDef<MergedRow>[] = [
    {
      accessorKey: "date",
      header: () => "Date",
      enableSorting: true,
      enableResizing: true,
      size: 160,
      minSize: 100,
      maxSize: 300,
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: "description",
      header: () => "Description",
      enableSorting: true,
      enableResizing: true,
      size: 300,
      minSize: 120,
      maxSize: 400,
      cell: (info) => (
        <span className="block max-w-[400px] overflow-hidden text-ellipsis whitespace-nowrap">
          {String(info.getValue())}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: () => "Amount",
      enableSorting: true,
      enableResizing: true,
      size: 120,
      minSize: 80,
      maxSize: 200,
      cell: (info) => {
        const value = parseFloat(info.getValue() as string);
        const colorClass =
          value > 0
            ? "text-green-600 dark:text-green-400"
            : value < 0
            ? "text-red-600 dark:text-red-400"
            : "";
        return <span className={colorClass}>{String(info.getValue())}</span>;
      },
    },
    {
      accessorKey: "source",
      header: () => "Source",
      enableSorting: true,
      enableResizing: true,
      size: 200,
      minSize: 100,
      maxSize: 400,
      cell: (info) => info.getValue(),
    },
  ];

  const visibleColumns = useMemo<ColumnDef<MergedRow>[]>(() => {
    if (searchColumns.length === 0) return allColumns;
    return allColumns.filter((col) =>
      searchColumns.includes((col.id ?? (col as any).accessorKey) as string)
    );
  }, [searchColumns, allColumns]);

  const table = useReactTable({
    data: filteredRows,
    columns: visibleColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode,
    debugTable: false,
  });

  const columnOptions = [
    { value: "date", label: "Date" },
    { value: "description", label: "Description" },
    { value: "amount", label: "Amount" },
    { value: "source", label: "Source" },
  ];

  return (
    <div className="flex flex-col items-center justify-center bg-white dark:bg-black p-4 min-h-screen">
      {/* File Chips Animation */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 mt-2 transition-all duration-500">
          {files.map((file, i) => (
            <div
              key={file.name}
              className={`px-4 py-2 rounded-lg shadow bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-gray-100 font-medium text-sm border border-gray-200 dark:border-gray-700 transition-all duration-500
                ${
                  showChips
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 -translate-y-4"
                }`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              📄 {file.name}
            </div>
          ))}
        </div>
      )}

      {/* Metrics Card */}
      {filteredRows.length > 0 && (
        <Card className="w-full max-w-3xl mb-4">
          <CardContent className="flex flex-row justify-between items-center gap-2 md:gap-0 px-2 md:px-6 py-4">
            <div className="flex-1 text-center min-w-0">
              <span className="text-xs text-gray-500">Total +</span>
              <span className="block text-lg font-semibold text-green-600 dark:text-green-400">
                $
                {filteredRows
                  .reduce(
                    (sum, row) =>
                      sum +
                      (parseFloat(row.amount) > 0 ? parseFloat(row.amount) : 0),
                    0
                  )
                  .toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
              </span>
            </div>
            <div className="flex-1 text-center min-w-0">
              <span className="text-xs text-gray-500">Total -</span>
              <span className="block text-lg font-semibold text-red-600 dark:text-red-400">
                -$
                {Math.abs(
                  filteredRows.reduce(
                    (sum, row) =>
                      sum +
                      (parseFloat(row.amount) < 0 ? parseFloat(row.amount) : 0),
                    0
                  )
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex-1 text-center min-w-0">
              <span className="text-xs text-gray-500">Net</span>
              <span className="block text-lg font-semibold text-gray-900 dark:text-gray-100">
                $
                {filteredRows
                  .reduce((sum, row) => sum + parseFloat(row.amount), 0)
                  .toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
              </span>
            </div>
            <div className="flex-1 text-center min-w-0">
              <span className="text-xs text-gray-500">Rows</span>
              <span className="block text-lg font-semibold text-blue-600 dark:text-blue-400">
                {filteredRows.length.toLocaleString()}
              </span>
            </div>
          </CardContent>
          {/* Bar Chart */}
          <div className="w-full h-20 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={getBarChartData(filteredRows)}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                barCategoryGap={8}
                barGap={2}
              >
                <XAxis
                  dataKey="month"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <RechartsTooltip content={<BarChartTooltip />} />
                <Bar
                  dataKey="positive"
                  fill="#16a34a"
                  radius={[4, 4, 0, 0]}
                  name="+"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="negative"
                  fill="#dc2626"
                  radius={[4, 4, 0, 0]}
                  name="-"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Dropzone with fade-out */}
      <div
        className={`transition-opacity duration-500 ${
          showDropzone
            ? "opacity-100"
            : "opacity-0 pointer-events-none h-0 mb-0"
        }`}
      >
        {showDropzone && (
          <Dropzone onDrop={handleDrop}>
            {(dropzone: DropzoneState) => (
              <div
                className="w-full max-w-2xl h-48 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center transition-colors duration-200 bg-white dark:bg-neutral-900 hover:border-[#1279cd] cursor-pointer"
                style={{ outline: "none" }}
                tabIndex={0}
                {...dropzone.getRootProps?.()}
              >
                <input {...dropzone.getInputProps?.()} />
                <div className="flex flex-col items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-8 h-8 mb-2 text-gray-700 dark:text-gray-200"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
                    />
                  </svg>
                  <span className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    Upload files
                  </span>
                </div>
              </div>
            )}
          </Dropzone>
        )}
      </div>

      {/* Filters */}
      {mergedRows.length > 0 && (
        <Card className="w-full max-w-3xl flex flex-col gap-3 mt-2 mb-4 p-4">
          {/* Row 1: Date pickers */}
          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <ShadcnDatePicker
              label="From"
              value={dateStart}
              onChange={(d) => setDateStart(d)}
            />
            <ShadcnDatePicker
              label="To"
              value={dateEnd}
              onChange={(d) => setDateEnd(d)}
            />
          </div>
          {/* Row 2: Column multi-select and search */}
          <div className="flex flex-col sm:flex-row gap-2 w-full items-stretch">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full sm:w-40 justify-between overflow-hidden text-ellipsis whitespace-nowrap"
                >
                  {isAllColumns
                    ? "All Columns"
                    : columnOptions
                        .filter((opt) => searchColumns.includes(opt.value))
                        .map((opt) => opt.label)
                        .join(", ") || "All Columns"}
                  <ChevronDownIcon className="ml-2 w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2 flex flex-col gap-1">
                {columnOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={searchColumns.includes(opt.value)}
                      onCheckedChange={(checked: boolean) => {
                        setSearchColumns((cols) =>
                          checked
                            ? [...cols, opt.value]
                            : cols.filter((c) => c !== opt.value)
                        );
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </PopoverContent>
            </Popover>
            <Input
              type="text"
              placeholder={
                isAllColumns
                  ? "Search all columns"
                  : `Search ${columnOptions
                      .filter((opt) => searchColumns.includes(opt.value))
                      .map((opt) => opt.label)
                      .join(", ")}`
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>
          {/* Row 3: Switch */}
          <div className="flex items-center gap-2 min-w-fit">
            <Label
              htmlFor="remove-payments"
              className="font-normal whitespace-nowrap"
            >
              Remove credit card payments
            </Label>
            <Switch
              id="remove-payments"
              checked={removePayments}
              onCheckedChange={setRemovePayments}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="p-0 h-6 w-6">
                  <Info className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                Removes rows that look like credit card payments: a debit from
                checking and a matching credit in credit card, usually with
                similar amounts and dates.
              </TooltipContent>
            </Tooltip>
          </div>
          {/* Row 4: Clear All Filters button */}
          <div className="flex w-full justify-end">
            <Button
              variant="outline"
              className="font-bold w-full sm:w-auto"
              onClick={() => {
                setDateStart("");
                setDateEnd("");
                setSearch("");
                setRemovePayments(false);
                setSearchColumns([]);
              }}
            >
              Clear All Filters
            </Button>
          </div>
        </Card>
      )}

      {/* Merged Table with sorting and resizing */}
      {mergedRows.length > 0 && (
        <div className="w-full h-[800px] flex flex-col gap-4">
          <div className="rounded-md border flex flex-2/3 flex-col overflow-auto">
            <Table className="h-full w-full">
              <TableHeader>
                <TableRow>
                  {table.getHeaderGroups()[0].headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={{
                        width: header.getSize(),
                        minWidth: header.column.columnDef.minSize,
                        maxWidth: header.column.columnDef.maxSize,
                        position: "relative",
                        userSelect: "none",
                        cursor: header.column.getCanSort()
                          ? "pointer"
                          : undefined,
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center select-none">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getCanSort() && (
                          <span className="ml-1 text-xs">
                            {header.column.getIsSorted() === "asc"
                              ? "▲"
                              : header.column.getIsSorted() === "desc"
                              ? "▼"
                              : ""}
                          </span>
                        )}
                        {header.column.getCanResize() && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none z-10"
                            style={{ touchAction: "none" }}
                          />
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
