import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  TooltipProps,
} from "recharts";
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}
// 1. Define types for the Tooltip
const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0a0a0a] border border-zinc-700 p-4 rounded-lg shadow-2xl">
        <p className="text-zinc-400 text-xs uppercase tracking-widest mb-1">
          {label}
        </p>
        <p className="text-white text-2xl font-bold tracking-tighter">
          ₹{payload[0].value?.toLocaleString("en-IN")}
        </p>
      </div>
    );
  }
  return null;
};

interface PriceRecord {
  date: string;
  current_price: number;
}

interface PriceGraphProps {
  history: PriceRecord[];
}

export default function PriceGraph({ history }: PriceGraphProps) {
  if (!history || history.length < 2) {
    return (
      <div className="w-full h-64 flex items-center justify-center border border-zinc-800 rounded-xl bg-black mt-8">
        <p className="text-zinc-500 font-medium tracking-wide">
          Not enough historical data to generate a graph yet. Check back
          tomorrow!
        </p>
      </div>
    );
  }

  // Group by date and keep only the LATEST price for each day
  // Map every single record, adding the exact time to make it unique
  const formattedHistory = history.map((record) => {
    const dateObj = new Date(record.date);

    const datePart = dateObj.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });

    const timePart = dateObj.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    return {
      ...record,
      // Unique string for Recharts (e.g., "11 Aug, 10:04 am")
      displayDate: `${datePart}, ${timePart}`,
    };
  });

  const prices = history.map((h) => h.current_price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const yAxisMin = minPrice - minPrice * 0.05;
  const yAxisMax = maxPrice + maxPrice * 0.05;

  return (
    <div className="w-full h-80 mt-8 bg-black p-6 rounded-2xl border border-zinc-900 shadow-inner">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
            Price History
          </h3>
          <p className="text-zinc-400 text-sm mt-1">Tracked over time</p>
        </div>
      </div>

      <div className="w-full h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={formattedHistory}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#27272a"
              vertical={false}
            />
            <XAxis
              dataKey="displayDate"
              stroke="#71717a"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              dy={10}
              // This keeps the UI clean by splitting "11 Aug, 10:04 am"
              // and only showing "11 Aug" on the bottom axis
              tickFormatter={(value) => value.split(",")[0]}
            />
            <YAxis
              domain={[yAxisMin, yAxisMax]}
              stroke="#71717a"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `₹${value.toLocaleString("en-IN")}`}
              width={80}
            />
            {/* 2. Tooltip now uses the outside component */}
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "#52525b",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />
            <Line
              type="monotone"
              dataKey="current_price"
              stroke="#ffffff"
              strokeWidth={3}
              dot={{ r: 4, fill: "#000", stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#fff", stroke: "#000", strokeWidth: 2 }}
              animationDuration={1500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
