import styles from './page.module.css'

export default function GameDriveDashboard() {
  // Sample data representing Game Drive's current clients and games
  const clients = [
    {
      id: 1,
      name: 'TMG',
      games: ['shapez', 'shapez 2', 'Puzzle DLC']
    },
    {
      id: 2, 
      name: 'WeirdBeard',
      games: ['Tricky Towers', 'Tricky Towers DLC']
    },
    {
      id: 3,
      name: 'tobspr',
      games: ['shapez', 'shapez Soundtrack']
    }
  ]

  const platforms = [
    { name: 'Steam', color: '#1b2838', cooldown: 30 },
    { name: 'PlayStation', color: '#0070d1', cooldown: 42 },
    { name: 'Xbox', color: '#107c10', cooldown: 28 },
    { name: 'Nintendo', color: '#e60012', cooldown: 56 },
    { name: 'Epic', color: '#000000', cooldown: 14 }
  ]

  // Sample upcoming sales (what would be in database)
  const upcomingSales = [
    {
      game: 'shapez 2',
      platform: 'Steam',
      startDate: '2025-01-15',
      discount: '40%',
      status: 'confirmed'
    },
    {
      game: 'Tricky Towers',
      platform: 'PlayStation', 
      startDate: '2025-02-01',
      discount: '35%',
      status: 'submitted'
    },
    {
      game: 'shapez',
      platform: 'Xbox',
      startDate: '2025-02-14',
      discount: '50%',
      status: 'planned'
    }
  ]

  return (
    <div className={styles.container}>
      
      {/* Header Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{backgroundColor: '#10b981'}}>
            📊
          </div>
          <div className={styles.statContent}>
            <h3>Total Revenue</h3>
            <p className={styles.statValue}>$42,500</p>
            <span className={styles.statChange}>+12% vs last month</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{backgroundColor: '#3b82f6'}}>
            🎮
          </div>
          <div className={styles.statContent}>
            <h3>Units Sold</h3>
            <p className={styles.statValue}>1,247</p>
            <span className={styles.statChange}>Across all platforms</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{backgroundColor: '#8b5cf6'}}>
            ⭐
          </div>
          <div className={styles.statContent}>
            <h3>Active Sales</h3>
            <p className={styles.statValue}>5</p>
            <span className={styles.statChange}>2 ending this week</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{backgroundColor: '#ef4444'}}>
            ⚠️
          </div>
          <div className={styles.statContent}>
            <h3>Conflicts</h3>
            <p className={styles.statValue}>0</p>
            <span className={styles.statChange}>All platforms clear</span>
          </div>
        </div>
      </div>

      {/* Main Timeline */}
      <div className={styles.timelineContainer}>
        <div className={styles.timelineHeader}>
          <h2>Sales Timeline - 12 Month View</h2>
          <div className={styles.timelineControls}>
            <button className={styles.controlButton}>Add Sale</button>
            <button className={styles.controlButton}>Check Conflicts</button>
            <button className={styles.controlButton}>Export Excel</button>
          </div>
        </div>

        {/* Month headers */}
        <div className={styles.monthGrid}>
          {['Jan 2025', 'Feb 2025', 'Mar 2025', 'Apr 2025', 'May 2025', 'Jun 2025', 
           'Jul 2025', 'Aug 2025', 'Sep 2025', 'Oct 2025', 'Nov 2025', 'Dec 2025'].map((month, index) => (
            <div key={month} className={styles.monthHeader}>
              <strong>{month}</strong>
            </div>
          ))}
        </div>

        {/* Game rows with sales */}
        <div className={styles.gameRows}>
          
          {/* shapez */}
          <div className={styles.gameRow}>
            <div className={styles.gameInfo}>
              <div className={styles.gameIcon} style={{backgroundColor: '#f97316'}}>S</div>
              <div>
                <div className={styles.gameName}>shapez</div>
                <div className={styles.gameClient}>tobspr Games</div>
              </div>
            </div>
            <div className={styles.timelineRow}>
              <div className={styles.saleBlock} style={{
                gridColumnStart: 3,
                gridColumnEnd: 5,
                backgroundColor: '#1b2838',
                color: 'white'
              }}>
                Steam 50%<br/>
                <small>Mar 15-28</small>
              </div>
              <div className={styles.cooldownBlock} style={{
                gridColumnStart: 5,
                gridColumnEnd: 7,
                backgroundColor: '#1b283850'
              }}>
                Cooldown
              </div>
              <div className={styles.saleBlock} style={{
                gridColumnStart: 8,
                gridColumnEnd: 10,
                backgroundColor: '#107c10',
                color: 'white'
              }}>
                Xbox 30%<br/>
                <small>Aug 1-14</small>
              </div>
            </div>
          </div>

          {/* shapez 2 */}
          <div className={styles.gameRow}>
            <div className={styles.gameInfo}>
              <div className={styles.gameIcon} style={{backgroundColor: '#8b5cf6'}}>S2</div>
              <div>
                <div className={styles.gameName}>shapez 2</div>
                <div className={styles.gameClient}>tobspr Games</div>
              </div>
            </div>
            <div className={styles.timelineRow}>
              <div className={styles.saleBlock} style={{
                gridColumnStart: 2,
                gridColumnEnd: 3,
                backgroundColor: '#1b2838',
                color: 'white'
              }}>
                Steam 40%<br/>
                <small>Jan 15-21</small>
              </div>
              <div className={styles.saleBlock} style={{
                gridColumnStart: 6,
                gridColumnEnd: 8,
                backgroundColor: '#0070d1',
                color: 'white'
              }}>
                PS 25%<br/>
                <small>Jun 1-7</small>
              </div>
            </div>
          </div>

          {/* Tricky Towers */}
          <div className={styles.gameRow}>
            <div className={styles.gameInfo}>
              <div className={styles.gameIcon} style={{backgroundColor: '#eab308'}}>TT</div>
              <div>
                <div className={styles.gameName}>Tricky Towers</div>
                <div className={styles.gameClient}>WeirdBeard</div>
              </div>
            </div>
            <div className={styles.timelineRow}>
              <div className={styles.saleBlock} style={{
                gridColumnStart: 4,
                gridColumnEnd: 6,
                backgroundColor: '#0070d1',
                color: 'white'
              }}>
                PS 35%<br/>
                <small>Apr 10-24</small>
              </div>
              <div className={styles.saleBlock} style={{
                gridColumnStart: 9,
                gridColumnEnd: 11,
                backgroundColor: '#000000',
                color: 'white'
              }}>
                Epic 45%<br/>
                <small>Sep 5-12</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Sales */}
      <div className={styles.upcomingContainer}>
        <h2>Upcoming Sales</h2>
        <div className={styles.salesGrid}>
          {upcomingSales.map((sale, index) => (
            <div key={index} className={styles.saleCard}>
              <div className={styles.saleHeader}>
                <strong>{sale.game}</strong>
                <span className={`${styles.statusBadge} ${styles[sale.status]}`}>
                  {sale.status}
                </span>
              </div>
              <div className={styles.saleDetails}>
                <div>Platform: <strong>{sale.platform}</strong></div>
                <div>Discount: <strong>{sale.discount}</strong></div>
                <div>Start: <strong>{sale.startDate}</strong></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Platform Legend */}
      <div className={styles.platformLegend}>
        <h3>Platform Cooldown Periods</h3>
        <div className={styles.legendGrid}>
          {platforms.map((platform) => (
            <div key={platform.name} className={styles.legendItem}>
              <div 
                className={styles.legendColor}
                style={{backgroundColor: platform.color}}
              ></div>
              <span>
                <strong>{platform.name}</strong>: {platform.cooldown} days cooldown
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Success Message */}
      <div className={styles.successMessage}>
        <div className={styles.successIcon}>✅</div>
        <div>
          <h3>CSS Pipeline Working!</h3>
          <p>
            GameDrive sales planning interface successfully deployed. 
            Next: Add interactive drag-and-drop functionality and Supabase integration.
          </p>
        </div>
      </div>
    </div>
  )
}