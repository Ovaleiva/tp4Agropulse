import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Line,
  Circle,
  Text as SvgText,
} from 'react-native-svg';
import { Reading } from '../types';

interface TelemetryLineChartProps {
  data: Reading[];
  thresholdMin?: number;
  thresholdMax?: number;
  strokeColor?: string;
  width?: number;
  height?: number;
}

export default function TelemetryLineChart({
  data,
  thresholdMin = 25,
  thresholdMax = 45,
  strokeColor = '#10B981',
  width = Dimensions.get('window').width - 64,
  height = 190,
}: TelemetryLineChartProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Padding inside the SVG viewport
  const paddingLeft = 34;
  const paddingRight = 14;
  const paddingTop = 20;
  const paddingBottom = 26;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Extract moisture values
  const values = data.map((d) => Number(d.moisture_pct));
  const rawMin = Math.min(...values, thresholdMin - 3);
  const rawMax = Math.max(...values, thresholdMax + 3);

  // Round min and max for clean grid steps
  const minY = Math.max(0, Math.floor(rawMin - 2));
  const maxY = Math.min(100, Math.ceil(rawMax + 2));
  const rangeY = Math.max(1, maxY - minY);

  // Function to map data point to SVG (x, y) coordinates
  const getX = (index: number) => {
    const first = Date.parse(data[0].measured_at);
    const span = Date.parse(data[data.length - 1].measured_at) - first;
    return paddingLeft + (span > 0 ? (Date.parse(data[index].measured_at) - first) / span : 0.5) * chartWidth;
  };

  const getY = (val: number) => {
    const clamped = Math.max(minY, Math.min(maxY, val));
    return paddingTop + chartHeight - ((clamped - minY) / rangeY) * chartHeight;
  };

  // Build points array
  const points = values.map((val, idx) => ({
    x: getX(idx),
    y: getY(val),
  }));

  // Generate cubic Bezier path for smooth aesthetic curves
  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const controlX1 = current.x + (next.x - current.x) / 2;
    const controlY1 = current.y;
    const controlX2 = current.x + (next.x - current.x) / 2;
    const controlY2 = next.y;
    linePath += ` C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${next.x} ${next.y}`;
  }

  // Generate closed area path for the gradient fill under the curve
  const areaBottomY = paddingTop + chartHeight;
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${areaBottomY} L ${points[0].x} ${areaBottomY} Z`;

  // Horizontal Grid Lines
  const gridSteps = 3;
  const gridLines = [];
  for (let i = 0; i <= gridSteps; i++) {
    const val = minY + (rangeY / gridSteps) * i;
    const y = getY(val);
    gridLines.push({ val: Math.round(val), y });
  }

  // Threshold minimum line Y position
  const thresholdMinY = getY(thresholdMin);

  // Time labels for X-axis (sample 4-5 evenly distributed)
  const xLabelIndices: number[] = [];
  const step = Math.max(1, Math.floor((data.length - 1) / 4));
  for (let i = 0; i < data.length; i += step) {
    xLabelIndices.push(i);
  }
  if (!xLabelIndices.includes(data.length - 1)) {
    xLabelIndices.push(data.length - 1);
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
            <Stop offset="65%" stopColor={strokeColor} stopOpacity="0.08" />
            <Stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </LinearGradient>
        </Defs>

        {/* Horizontal grid lines and Y-axis labels */}
        {gridLines.map((grid, idx) => (
          <React.Fragment key={idx}>
            <Line
              x1={paddingLeft}
              y1={grid.y}
              x2={paddingLeft + chartWidth}
              y2={grid.y}
              stroke="#1E293B"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <SvgText
              x={paddingLeft - 8}
              y={grid.y + 3.5}
              fill="#64748B"
              fontSize="9"
              fontWeight="600"
              textAnchor="end"
            >
              {`${grid.val}%`}
            </SvgText>
          </React.Fragment>
        ))}

        {/* Agronomic Threshold Minimum Reference Line */}
        {thresholdMinY >= paddingTop && thresholdMinY <= paddingTop + chartHeight && (
          <>
            <Line
              x1={paddingLeft}
              y1={thresholdMinY}
              x2={paddingLeft + chartWidth}
              y2={thresholdMinY}
              stroke="#EF4444"
              strokeWidth="1.2"
              strokeDasharray="4 2"
              opacity={0.7}
            />
            <SvgText
              x={paddingLeft + chartWidth}
              y={thresholdMinY - 4}
              fill="#EF4444"
              fontSize="8"
              fontWeight="700"
              textAnchor="end"
              opacity={0.8}
            >
              {`Umbral Mín (${thresholdMin}%)`}
            </SvgText>
          </>
        )}

        {/* Gradient Fill under the curve */}
        <Path d={areaPath} fill="url(#chartGradient)" />

        {/* Main Telemetric Smooth Curve Line */}
        <Path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* High-definition point markers */}
        {points.map((pt, idx) => (
          <React.Fragment key={idx}>
            <Circle
              cx={pt.x}
              cy={pt.y}
              r="4.5"
              fill="#FFFFFF"
              stroke={strokeColor}
              strokeWidth="2"
            />
            {idx === points.length - 1 && (
              <Circle
                cx={pt.x}
                cy={pt.y}
                r="7"
                fill="none"
                stroke={strokeColor}
                strokeWidth="1"
                opacity={0.5}
              />
            )}
          </React.Fragment>
        ))}

        {/* Bottom X-axis Time Labels */}
        {xLabelIndices.map((dataIdx) => {
          const item = data[dataIdx];
          const d = new Date(item.measured_at);
          const timeStr = `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
          const x = getX(dataIdx);

          return (
            <SvgText
              key={dataIdx}
              x={x}
              y={height - 6}
              fill="#64748B"
              fontSize="9"
              fontWeight="600"
              textAnchor="middle"
            >
              {timeStr}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
