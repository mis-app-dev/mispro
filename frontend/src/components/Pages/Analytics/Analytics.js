import React, { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { FaUserFriends, FaSync } from 'react-icons/fa';
import styles from './Analytics.module.css';
import { getAnalytics } from '../../../services/api';

const formatNumber = (num) => {
  if (num === undefined || num === null) return '0';
  return new Intl.NumberFormat('id-ID').format(num);
};

const TrendTextRight = ({ growth, isPositive, label = 'from last year' }) => {
  const val = growth ? Number(growth) : 0;
  const positive = isPositive !== undefined ? isPositive : val >= 0;

  return (
    <div className={styles.trendRightContainer}>
      <span>{positive ? 'Increased' : 'Decreased'}&nbsp;</span>
      <span className={positive ? styles.trendPositive : styles.trendNegative}>
        {Math.abs(val).toFixed(1)}%
      </span>
      <span>&nbsp;{label}</span>
    </div>
  );
};

const SimpleStatCard = ({ title, count, growth, trendLabel }) => (
  <div className={styles.card}>
    <div className={styles.cardTopRow}>
      <div className={styles.cardTitle}>{title}</div>
      <TrendTextRight growth={growth} label={trendLabel} />
    </div>
    <div className={styles.cardMainStat}>
      <div className={styles.statValue}>{formatNumber(count)}</div>
      <FaUserFriends className={styles.statIcon} />
    </div>
  </div>
);

const DetailedStatCard = ({ title, data, trendLabel }) => {
  if (!data) return null;
  const growthTotal =
    data.growth_total !== undefined ? data.growth_total : data.growth;
  const growthConfirmed =
    data.growth_confirmed !== undefined ? data.growth_confirmed : 0;
  const growthCancelled =
    data.growth_cancelled !== undefined ? data.growth_cancelled : 0;

  const isCancelledPositive = Number(growthCancelled) <= 0;

  return (
    <div className={styles.card}>
      <div style={{ marginBottom: '16px' }}>
        <div className={styles.cardTopRow}>
          <div className={styles.cardTitle}>{title}</div>
          <TrendTextRight growth={growthTotal} label={trendLabel} />
        </div>

        <div className={styles.cardMainStat}>
          <div className={styles.statValue}>{formatNumber(data.total)}</div>
          <FaUserFriends className={styles.statIcon} />
        </div>
      </div>

      <div className={styles.subStatsContainer}>
        <div className={styles.subStatBox}>
          <div className={styles.subStatLabel}>Confirmed</div>
          <div className={styles.subStatContentCenter}>
            <div className={styles.subStatValue}>
              {formatNumber(data.confirmed)}
            </div>
            <FaUserFriends className={styles.subStatIcon} />
          </div>
          <div className={styles.trendCenterText}>
            <span
              className={
                Number(growthConfirmed) >= 0
                  ? styles.trendPositive
                  : styles.trendNegative
              }
            >
              {Number(growthConfirmed).toFixed(1)}%
            </span>{' '}
            {trendLabel || 'from last year'}
          </div>
        </div>
        <div className={styles.subStatBox}>
          <div className={styles.subStatLabel}>Cancelled</div>
          <div className={styles.subStatContentCenter}>
            <div className={styles.subStatValue}>
              {formatNumber(data.cancelled)}
            </div>
            <FaUserFriends className={styles.subStatIcon} />
          </div>
          <div className={styles.trendCenterText}>
            <span
              className={
                isCancelledPositive
                  ? styles.trendPositive
                  : styles.trendNegative
              }
            >
              {Number(growthCancelled).toFixed(1)}%
            </span>{' '}
            {trendLabel || 'from last year'}
          </div>
        </div>
      </div>
    </div>
  );
};

const OrangePieCard = ({ syData, titleLabel }) => {
  const returningVal = syData?.returning?.total || 0;
  const newVal = syData?.new?.total || 0;
  const transferVal = syData?.transferee?.total || 0;
  const totalVal = syData?.all?.total || 1;
  const calcBase = totalVal === 0 ? 1 : totalVal;
  const returningPct = Math.round((returningVal / calcBase) * 100);
  const newPct = Math.round((newVal / calcBase) * 100);
  const transferPct = Math.round((transferVal / calcBase) * 100);

  const data = [
    {
      name: 'Returning Students',
      value: returningPct || 0,
      count: returningVal,
      color: '#ffffff',
    },
    {
      name: 'New Students',
      value: newPct || 0,
      count: newVal,
      color: '#ffeb53',
    },
    {
      name: 'Transferred Students',
      value: transferPct || 0,
      count: transferVal,
      color: '#ffcf30',
    },
  ];

  return (
    <div className={styles.orangeCard}>
      <div className={styles.orangeContentLeft}>
        <div className={styles.orangeHeaderSection}>
          <div className={styles.orangeTitle}>
            Total Registered ({titleLabel})
          </div>
          <div className={styles.orangeValueWrapper}>
            <div className={styles.orangeValue}>
              {formatNumber(syData?.all?.total)}
            </div>
            <FaUserFriends style={{ fontSize: '24px', marginBottom: '6px' }} />
          </div>
        </div>

        <div className={styles.orangeLegendContainer}>
          {data.map((item, index) => (
            <div key={index} className={styles.orangeLegendRow}>
              <div
                className={styles.legendColorBox}
                style={{ backgroundColor: item.color }}
              ></div>
              <div className={styles.legendTextGroup}>
                <div className={styles.legendPercent}>
                  {item.value}% ({item.count})
                </div>
                <div className={styles.legendLabel}>{item.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.orangeChartWrapper}>
        <ResponsiveContainer width='100%' height='100%'>
          <PieChart>
            <Pie
              data={data}
              innerRadius={45}
              outerRadius={65}
              dataKey='value'
              stroke='none'
              startAngle={90}
              endAngle={-270}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const GrossStatCard = ({ globalData, trendData }) => {
  const chartData =
    trendData?.current_data?.map((val) => {
      const safeVal = typeof val === 'object' && val !== null ? val.total : val;
      return { val: safeVal || 0 };
    }) || [];

  return (
    <div className={styles.grossCard}>
      <div className={styles.grossInfo}>
        <div className={styles.cardTitleWhite}>Total Registration (Global)</div>
        <div className={styles.cardMainStat}>
          <div className={styles.statValueWhite}>
            {formatNumber(globalData?.total)}
          </div>
          <FaUserFriends className={styles.statIconWhite} />
        </div>
      </div>
      <div className={styles.grossChart}>
        <ResponsiveContainer width='100%' height='100%'>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id='grossGradient' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='5%' stopColor='#00f413' stopOpacity={0.8} />
                <stop offset='95%' stopColor='#00f413' stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type='monotone'
              dataKey='val'
              stroke='#00f413'
              fill='url(#grossGradient)'
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const ActiveStudentsTable = ({ matrixData, syName }) => {
  if (!matrixData) return null;
  const levels = ['High', 'Middle', 'Elementary', 'ECP'];

  return (
    <div className={styles.tableSectionContainer}>
      <div className={styles.asCard}>
        <div className={styles.asHeaderRow}>
          <div className={styles.asTitle}>Active Students</div>
          <div className={styles.asYear}>S.Y {syName}</div>
        </div>
        <div className={styles.asTableFlex}>
          <div className={styles.asColLabels}>
            <div
              className={`${styles.asCell} ${styles.asCellHeader} ${styles.asBgTransparent}`}
            ></div>
            {levels.map((level) => (
              <div
                key={level}
                className={`${styles.asCell} ${styles.asCellBody} ${styles.asBgGrey}`}
              >
                {level === 'High'
                  ? 'High School'
                  : level === 'Middle'
                  ? 'Middle School'
                  : level === 'Elementary'
                  ? 'Elementary School'
                  : 'Early Childhood Program'}
              </div>
            ))}
            <div className={`${styles.asCell} ${styles.asCellTotal}`}></div>
          </div>
          <div className={styles.asColData}>
            <div
              className={`${styles.asCell} ${styles.asCellHeader} ${styles.asBgGrey}`}
            >
              New Student
            </div>
            {levels.map((level) => (
              <div
                key={level}
                className={`${styles.asCell} ${styles.asCellBody} ${styles.asBgWhite}`}
              >
                {matrixData[level]?.total_new || 0}
              </div>
            ))}
            <div className={`${styles.asCell} ${styles.asCellTotal}`}>
              <span className={styles.asTextGreen}>
                {matrixData.Total?.total_new || 0}
              </span>
            </div>
          </div>
          <div className={styles.asColData}>
            <div
              className={`${styles.asCell} ${styles.asCellHeader} ${styles.asBgGrey}`}
            >
              Old Student
            </div>
            {levels.map((level) => (
              <div
                key={level}
                className={`${styles.asCell} ${styles.asCellBody} ${styles.asBgWhite}`}
              >
                {matrixData[level]?.total_returning || 0}
              </div>
            ))}
            <div className={`${styles.asCell} ${styles.asCellTotal}`}>
              <span className={styles.asTextGreen}>
                {matrixData.Total?.total_returning || 0}
              </span>
            </div>
          </div>
          <div className={styles.asColData}>
            <div
              className={`${styles.asCell} ${styles.asCellHeader} ${styles.asBgGrey}`}
            >
              Transferee
            </div>
            {levels.map((level) => (
              <div
                key={level}
                className={`${styles.asCell} ${styles.asCellBody} ${styles.asBgWhite}`}
              >
                {matrixData[level]?.total_transferee || 0}
              </div>
            ))}
            <div className={`${styles.asCell} ${styles.asCellTotal}`}>
              <span className={styles.asTextGreen}>
                {matrixData.Total?.total_transferee || 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const CITIZENSHIP_LEVELS = ['All', 'ECP', 'Elementary', 'Middle', 'High'];
const CITIZENSHIP_LEVEL_LABELS = {
  All: 'All Levels',
  ECP: 'Early Childhood Program',
  Elementary: 'Elementary School',
  Middle: 'Middle School',
  High: 'High School',
};
const CITIZENSHIP_SHORT_LABELS = {
  ECP: 'ECP',
  Elementary: 'ES',
  Middle: 'MS',
  High: 'HS',
};
const COLOR_INDONESIA = '#EE0808';
const COLOR_NON_INDONESIA = '#5F84FE';

const CitizenshipCard = ({ citizenship, syName }) => {
  const [level, setLevel] = useState('All');

  if (!citizenship) return null;

  const emptyStats = { total: 0, indonesia: 0, non_indonesia: 0, countries: [] };
  const stats = citizenship[level] || emptyStats;
  const pct = (val) =>
    stats.total > 0 ? Math.round((val / stats.total) * 1000) / 10 : 0;

  const handleLevelClick = (e) => {
    e.preventDefault();
    const next =
      (CITIZENSHIP_LEVELS.indexOf(level) + 1) % CITIZENSHIP_LEVELS.length;
    setLevel(CITIZENSHIP_LEVELS[next]);
  };

  const donutData = [
    { name: 'Indonesian', value: stats.indonesia, color: COLOR_INDONESIA },
    {
      name: 'Non-Indonesian',
      value: stats.non_indonesia,
      color: COLOR_NON_INDONESIA,
    },
  ];

  const levelChartData = ['ECP', 'Elementary', 'Middle', 'High'].map((key) => ({
    name: CITIZENSHIP_SHORT_LABELS[key],
    key,
    indonesia: citizenship[key]?.indonesia || 0,
    non_indonesia: citizenship[key]?.non_indonesia || 0,
  }));

  return (
    <div className={`${styles.sectionCard} ${styles.citizenshipCard}`}>
      <div className={styles.sectionHeader}>
        <div>
          <div className={styles.sectionTitle}>
            Indonesian vs Non-Indonesian Students
          </div>
          <div className={styles.citizenshipSubtitle}>
            Active students, S.Y {syName}
          </div>
        </div>
        <div
          className={styles.trendContainer}
          onClick={handleLevelClick}
          style={{
            cursor: 'pointer',
            color: 'var(--main-accent)',
            userSelect: 'none',
          }}
          title='Click to change level'
        >
          {CITIZENSHIP_LEVEL_LABELS[level]}{' '}
          <FaSync style={{ fontSize: '10px' }} />
        </div>
      </div>

      <div className={styles.citizenshipGrid}>
        <div className={styles.citizenshipSummary}>
          <div className={styles.citizenshipDonut}>
            <ResponsiveContainer width='100%' height='100%'>
              <PieChart>
                <Pie
                  data={stats.total > 0 ? donutData : [{ value: 1 }]}
                  innerRadius={55}
                  outerRadius={80}
                  dataKey='value'
                  stroke='none'
                  startAngle={90}
                  endAngle={-270}
                >
                  {stats.total > 0 ? (
                    donutData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))
                  ) : (
                    <Cell fill='#f0f0f0' />
                  )}
                </Pie>
                {stats.total > 0 && <Tooltip />}
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.citizenshipDonutCenter}>
              <div className={styles.citizenshipDonutValue}>
                {formatNumber(stats.total)}
              </div>
              <div className={styles.citizenshipDonutLabel}>Students</div>
            </div>
          </div>

          <div className={styles.citizenshipLegend}>
            {donutData.map((item) => (
              <div key={item.name} className={styles.citizenshipLegendRow}>
                <div
                  className={styles.legendColorBox}
                  style={{ backgroundColor: item.color }}
                ></div>
                <div>
                  <div className={styles.citizenshipLegendValue}>
                    {formatNumber(item.value)}{' '}
                    <span className={styles.citizenshipLegendPct}>
                      ({pct(item.value)}%)
                    </span>
                  </div>
                  <div className={styles.citizenshipLegendName}>
                    {item.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.citizenshipColumn}>
          <div className={styles.citizenshipColumnTitle}>Per Level</div>
          <div className={styles.citizenshipBarChart}>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart
                data={levelChartData}
                layout='vertical'
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray='3 3' horizontal={false} />
                <XAxis
                  type='number'
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#7A7A7A' }}
                />
                <YAxis
                  type='category'
                  dataKey='name'
                  width={40}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fontWeight: 600 }}
                />
                <Tooltip />
                <Bar
                  dataKey='indonesia'
                  name='Indonesian'
                  stackId='c'
                  fill={COLOR_INDONESIA}
                  barSize={18}
                />
                <Bar
                  dataKey='non_indonesia'
                  name='Non-Indonesian'
                  stackId='c'
                  fill={COLOR_NON_INDONESIA}
                  barSize={18}
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.citizenshipColumn}>
          <div className={styles.citizenshipColumnTitle}>
            Non-Indonesian by Country
          </div>
          {stats.countries.length > 0 ? (
            <div className={styles.countryList}>
              {stats.countries.map((c) => (
                <div key={c.country} className={styles.countryRow}>
                  <span className={styles.countryName}>{c.country}</span>
                  <span className={styles.countryCount}>{c.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.countryEmpty}>
              No non-Indonesian students
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const RegistrationGrowthChart = ({ multiYearData }) => {
  if (!multiYearData || !multiYearData.labels) return null;

  const chartData = multiYearData.labels.map((year, index) => {
    const rawData = multiYearData.data[index];
    let finalValue = 0;
    let confirmedVal = 0;
    let cancelledVal = 0;

    if (typeof rawData === 'object' && rawData !== null) {
      finalValue = rawData.total || 0;
      confirmedVal = rawData.confirmed || 0;
      cancelledVal = rawData.cancelled || 0;
    } else {
      finalValue = rawData || 0;
    }

    return {
      year: year,
      value: finalValue,
      confirmed: confirmedVal,
      cancelled: cancelledVal,
    };
  });

  const CustomTooltipGrowth = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div
          style={{
            backgroundColor: '#fff',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '5px',
            fontSize: '12px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
          }}
        >
          <p style={{ fontWeight: 'bold', margin: '0 0 5px 0' }}>{label}</p>
          <p style={{ margin: 0 }}>
            Total: <strong>{data.value}</strong>
          </p>
          <p style={{ margin: 0, color: '#5F84FE' }}>
            confirmed: {data.confirmed}
          </p>
          <p style={{ margin: 0, color: '#EE0808' }}>
            cancelled: {data.cancelled}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}>Registration Trend - Long term</div>
        <div className={styles.growthSubtitle}>5 Year</div>
      </div>
      <div className={styles.chartContainer}>
        <ResponsiveContainer width='100%' height='100%'>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id='colorGrowth' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='5%' stopColor='#00f413' stopOpacity={0.3} />
                <stop offset='95%' stopColor='#00f413' stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray='3 3' vertical={false} />
            <XAxis
              dataKey='year'
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fontWeight: 600 }}
              dy={10}
            />
            <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltipGrowth />} />
            <Area
              type='monotone'
              dataKey='value'
              stroke='var(--green)'
              fillOpacity={1}
              fill='url(#colorGrowth)'
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const RegistrationTrendChart = ({ trends }) => {
  if (!trends) return null;

  const chartData = trends.labels.map((month, index) => {
    const currentRaw = trends.current_data[index];
    const previousRaw = trends.previous_data[index];

    const currentVal =
      typeof currentRaw === 'object' && currentRaw !== null
        ? currentRaw.total || 0
        : currentRaw || 0;
    const currentConfirmed =
      typeof currentRaw === 'object' ? currentRaw.confirmed || 0 : 0;
    const currentCancelled =
      typeof currentRaw === 'object' ? currentRaw.cancelled || 0 : 0;

    const previousVal =
      typeof previousRaw === 'object' && previousRaw !== null
        ? previousRaw.total || 0
        : previousRaw || 0;
    const previousConfirmed =
      typeof previousRaw === 'object' ? previousRaw.confirmed || 0 : 0;
    const previousCancelled =
      typeof previousRaw === 'object' ? previousRaw.cancelled || 0 : 0;

    return {
      month: month,
      current: currentVal,
      current_confirmed: currentConfirmed,
      current_cancelled: currentCancelled,
      previous: previousVal,
      previous_confirmed: previousConfirmed,
      previous_cancelled: previousCancelled,
    };
  });

  const CustomTooltipTrend = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            backgroundColor: '#fff',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '5px',
            fontSize: '12px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
          }}
        >
          <p style={{ fontWeight: 'bold', margin: '0 0 8px 0' }}>{label}</p>
          {payload.map((entry, index) => {
            const isCurrent = entry.dataKey === 'current';
            const confirmed = isCurrent
              ? entry.payload.current_confirmed
              : entry.payload.previous_confirmed;
            const cancelled = isCurrent
              ? entry.payload.current_cancelled
              : entry.payload.previous_cancelled;

            return (
              <div key={index} style={{ marginBottom: '10px' }}>
                <p
                  style={{
                    margin: 0,
                    color: entry.color,
                    fontWeight: 600,
                  }}
                >
                  {entry.name}: {entry.value}
                </p>
                <p style={{ margin: 0, color: '#555' }}>
                  confirmed: {confirmed}
                </p>
                <p style={{ margin: 0, color: '#555' }}>
                  cancelled: {cancelled}
                </p>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}>Registration Trend - Short term</div>
        <div className={styles.trendLegend}>
          <div className={styles.legendItem}>
            <div
              className={styles.legendColorBox}
              style={{ backgroundColor: '#EE0808' }}
            ></div>
            <span>{trends.current_label}</span>
          </div>
          <div className={styles.legendItem}>
            <div
              className={styles.legendColorBox}
              style={{ backgroundColor: '#5F84FE' }}
            ></div>
            <span>{trends.previous_label}</span>
          </div>
        </div>
      </div>
      <div className={styles.chartContainer}>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray='3 3' vertical={false} />
            <XAxis
              dataKey='month'
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fontWeight: 600 }}
              dy={10}
            />
            <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltipTrend />} />
            <Line
              type='monotone'
              dataKey='current'
              stroke='#EE0808'
              strokeWidth={3}
              dot={false}
              name={trends.current_label}
            />
            <Line
              type='monotone'
              dataKey='previous'
              stroke='#5F84FE'
              strokeWidth={3}
              dot={false}
              name={trends.previous_label}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const Analytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [regMode, setRegMode] = useState('pre_register');
  const [servedLevel, setServedLevel] = useState('All');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (refresh = false) => {
    try {
      if (refresh) setIsRefreshing(true);

      const response = await getAnalytics(refresh);

      if (response.success) {
        setData(response.data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefreshClick = () => {
    if (!isRefreshing) {
      fetchData(true);
    }
  };

  const handleRegModeClick = (e) => {
    e.preventDefault();
    const modes = ['pre_register', 'daily', 'yearly'];
    const currentIndex = modes.indexOf(regMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setRegMode(modes[nextIndex]);
  };

  const handleServedLevelClick = (e) => {
    e.preventDefault();
    const levels = ['All', 'ECP', 'Elementary', 'Middle', 'High'];
    const currentIndex = levels.indexOf(servedLevel);
    const nextIndex = (currentIndex + 1) % levels.length;
    setServedLevel(levels[nextIndex]);
  };

  const getRegModeLabel = () => {
    if (regMode === 'daily') return 'Daily';
    if (regMode === 'yearly') return 'Yearly';
    return 'Pre-Registered';
  };

  const getServedLevelLabel = () => {
    if (servedLevel === 'ECP') return 'ECP';
    if (servedLevel === 'High') return 'High School';
    if (servedLevel === 'Middle') return 'Middle School';
    if (servedLevel === 'Elementary') return 'Elementary School';
    return 'All Levels';
  };

  if (loading) {
    return (
      <div className={styles.mainContainer}>
        <p>Loading analytics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.mainContainer}>
        <p>No data available.</p>
      </div>
    );
  }

  let currentRegData = {};
  if (regMode === 'daily') {
    currentRegData = data.today || {};
  } else if (regMode === 'yearly') {
    currentRegData = data.school_year || {};
  } else {
    currentRegData = data.pre_register || {};
  }

  const trendLabel =
    regMode === 'daily'
      ? 'from yesterday'
      : regMode === 'pre_register'
      ? 'from current year'
      : 'from last year';

  let servedSummary = {
    total: 0,
    active: 0,
    graduate: 0,
    expelled: 0,
    withdraw: 0,
    unknown: 0,
  };

  if (servedLevel === 'All') {
    servedSummary = data.enrollment_unique_students?.summary || servedSummary;
  } else {
    servedSummary =
      data.enrollment_unique_students?.breakdown?.[servedLevel] ||
      servedSummary;
  }

  const servedTotal = servedSummary.total;
  const getDonutData = (val, max) => {
    const safeMax = max > 0 ? max : 1;
    return [{ value: val }, { value: safeMax - val }];
  };

  const global = data.global;
  const trendsData = data.trends || data.monthly_trends;
  const rawMatrix = data.active_students_matrix || {};
  const hs = rawMatrix['High'] || {
    total: 0,
    total_new: 0,
    total_returning: 0,
    total_transferee: 0,
  };
  const ms = rawMatrix['Middle'] || {
    total: 0,
    total_new: 0,
    total_returning: 0,
    total_transferee: 0,
  };
  const es = rawMatrix['Elementary'] || {
    total: 0,
    total_new: 0,
    total_returning: 0,
    total_transferee: 0,
  };
  const ecp = rawMatrix['ECP'] || {
    total: 0,
    total_new: 0,
    total_returning: 0,
    total_transferee: 0,
  };

  const totalMatrix = {
    total: hs.total + ms.total + es.total + ecp.total,
    total_new: hs.total_new + ms.total_new + es.total_new + ecp.total_new,
    total_returning:
      hs.total_returning +
      ms.total_returning +
      es.total_returning +
      ecp.total_returning,
    total_transferee:
      hs.total_transferee +
      ms.total_transferee +
      es.total_transferee +
      ecp.total_transferee,
  };

  const activeMatrix = {
    High: hs,
    Middle: ms,
    Elementary: es,
    ECP: ecp,
    Total: totalMatrix,
  };

  const activeStudentChartData = [
    { name: 'HS', value: activeMatrix.High.total },
    { name: 'MS', value: activeMatrix.Middle.total },
    { name: 'ES', value: activeMatrix.Elementary.total },
    { name: 'ECP', value: activeMatrix.ECP.total },
  ];

  return (
    <div className={styles.mainContainer}>
      <div className={styles.headerSection}>
        <div className={styles.pageTitle}>Analytics</div>

        <button
          className={styles.refreshButton}
          onClick={handleRefreshClick}
          disabled={isRefreshing}
          title='Refresh Data (Clear Cache)'
        >
          <FaSync className={isRefreshing ? styles.spinIcon : ''} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh Data'}</span>
        </button>
      </div>

      <div className={styles.topSectionSplit}>
        <div className={styles.leftColumnWrapper}>
          <div
            className={styles.preRegisteredHeader}
            onClick={handleRegModeClick}
            style={{
              cursor: 'pointer',
              userSelect: 'none',
              zIndex: 10,
              position: 'relative',
              display: 'inline-flex',
            }}
            title='Click to toggle view'
          >
            {getRegModeLabel()}
            <FaSync style={{ fontSize: '12px', marginLeft: '6px' }} />
          </div>

          <div className={styles.leftColumnCards}>
            <SimpleStatCard
              title='Total Registration'
              count={currentRegData.all?.total}
              growth={currentRegData.all?.growth_total}
              trendLabel={trendLabel}
            />
            <DetailedStatCard
              title='Total Registration (New)'
              data={currentRegData.new}
              trendLabel={trendLabel}
            />
            <DetailedStatCard
              title='Total Registration (Returning)'
              data={currentRegData.returning}
              trendLabel={trendLabel}
            />
          </div>
        </div>

        <div className={styles.rightColumnCards}>
          <OrangePieCard
            syData={currentRegData}
            titleLabel={getRegModeLabel()}
          />
          <DetailedStatCard
            title='Total Registration (Transfer)'
            data={currentRegData.transferee}
            trendLabel={trendLabel}
          />
        </div>
      </div>

      <div className={styles.dashboardGrid}>
        <div className={`${styles.sectionCard} ${styles.activeStudentCard}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Active Students</div>
            <div style={{ fontSize: '12px', color: 'var(--main-grey)' }}>
              S.Y {data.meta.current_sy}
            </div>
          </div>
          <div className={styles.activeBigNumber}>
            <div className={styles.statValue}>
              {formatNumber(activeMatrix.Total.total)}
            </div>
            <FaUserFriends className={styles.statIcon} />
          </div>
          <div className={styles.activeChartContainer}>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart
                data={activeStudentChartData}
                margin={{ top: 20, right: 0, left: -25, bottom: 0 }}
              >
                <XAxis
                  dataKey='name'
                  tick={{ fontSize: 12, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#7A7A7A' }}
                  allowDecimals={false} 
                />
                <Tooltip />
                <Bar
                  dataKey='value'
                  fill='var(--green)'
                  radius={[20, 20, 20, 20]}
                  barSize={24}
                  background={{ fill: '#f0f0f0', radius: [20, 20, 20, 20] }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.rightColumnStack}>
          <GrossStatCard globalData={global} trendData={trendsData} />
          <div className={`${styles.sectionCard} ${styles.servedStudentsCard}`}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Total Served Students</div>
              <div
                className={styles.trendContainer}
                onClick={handleServedLevelClick}
                style={{
                  cursor: 'pointer',
                  color: 'var(--main-accent)',
                  userSelect: 'none',
                  zIndex: 10,
                  position: 'relative',
                }}
              >
                {getServedLevelLabel()} <FaSync style={{ fontSize: '10px' }} />
              </div>
            </div>
            <div
              className={styles.activeBigNumber}
              style={{ marginBottom: '20px' }}
            >
              <div className={styles.textGradientPurple}>
                {formatNumber(servedTotal)}
              </div>
              <FaUserFriends className={styles.statIcon} />
            </div>
            <div className={styles.servedStatsGrid}>
              <div className={styles.donutStat}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={getDonutData(servedSummary.graduate, servedTotal)}
                      innerRadius={60}
                      outerRadius={80}
                      dataKey='value'
                      stroke='none'
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={5}
                    >
                      <Cell fill='#00C49F' />
                      <Cell fill='var(--main-background)' />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className={styles.donutLabel}>
                  <div className={styles.textGradientGreenSmall}>
                    {formatNumber(servedSummary.graduate)}
                  </div>
                  <div
                    className={`${styles.donutText} ${styles.textGradientGreenSmall}`}
                  >
                    Graduated <br /> Students
                  </div>
                </div>
              </div>
              <div className={styles.donutStat}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={getDonutData(servedSummary.withdraw, servedTotal)}
                      innerRadius={60}
                      outerRadius={80}
                      dataKey='value'
                      stroke='none'
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={5}
                    >
                      <Cell fill='#ca66ff' />
                      <Cell fill='var(--main-background)' />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className={styles.donutLabel}>
                  <div className={styles.textGradientPinkSmall}>
                    {formatNumber(servedSummary.withdraw)}
                  </div>
                  <div
                    className={`${styles.donutText} ${styles.textGradientPinkSmall}`}
                  >
                    Withdrawn <br /> Students
                  </div>
                </div>
              </div>
              <div className={styles.donutStat}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={getDonutData(servedSummary.expelled, servedTotal)}
                      innerRadius={60}
                      outerRadius={80}
                      dataKey='value'
                      stroke='none'
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={5}
                    >
                      <Cell fill='#FF8042' />
                      <Cell fill='var(--main-background)' />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className={styles.donutLabel}>
                  <div className={styles.textGradientOrangeSmall}>
                    {formatNumber(servedSummary.expelled)}
                  </div>
                  <div
                    className={`${styles.donutText} ${styles.textGradientOrangeSmall}`}
                  >
                    Expelled <br /> Students
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ActiveStudentsTable
        matrixData={activeMatrix}
        syName={data.meta.current_sy}
      />

      <CitizenshipCard
        citizenship={data.citizenship}
        syName={data.meta.current_sy}
      />

      <div className={styles.bottomChartsGrid}>
        <RegistrationGrowthChart multiYearData={data.multi_year_trend} />
        <RegistrationTrendChart trends={trendsData} />
      </div>
    </div>
  );
};

export default Analytics;
