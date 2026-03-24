"use client";

import { useEffect, useState } from "react";


type Job = {
  id: number;
  title: string;
  company: string;
  location: string;
  link: string;
  date_posted: string;
  source: string;
  job_type?: string;
  created_at: string;

  postedText?: string;
};

const TIME_FILTERS = [
  { label: "Any time", hours: 24 * 30 },
  { label: "Last hour", hours: 1 },
  { label: "Last 6 hours", hours: 6 },
  { label: "Last 12 hours", hours: 12 },
  { label: "Last 1 day", hours: 24 },
  { label: "Last 2 days", hours: 48 },
  { label: "Last 3 days", hours: 72 },
  { label: "Last week", hours: 168 },
  { label: "Last two weeks", hours: 336 },
  { label: "Last month", hours: 720 }
];

const ONTARIO_CITIES = [
  "All Cities", "Remote", "Toronto", "Ottawa", "Mississauga", "Brampton",
  "Hamilton", "London", "Markham", "Vaughan", "Kitchener", "Windsor",
  "Burlington", "Greater Sudbury", "Oshawa", "Barrie", "St. Catharines",
  "Cambridge", "Kingston", "Guelph", "Thunder Bay", "Waterloo", "Brantford"
];

const FIELDS = [
  "All Fields", "Software Engineering", "Web Development", "Data Science/Analytics",
  "IT/Networking", "Quality Assurance", "Finance", "Operations", "Marketing", "HR"
];

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchTitle, setSearchTitle] = useState("");
  const [city, setCity] = useState("All Cities");
  const [field, setField] = useState("All Fields");
  const [jobCategory, setJobCategory] = useState("All Categories");
  const [postAge, setPostAge] = useState("Any time");
  const [viewedJobs, setViewedJobs] = useState<Set<number>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    // Fetch all jobs initially
    fetch("/api/log-visit");
    fetchJobs();

    // Load viewed jobs from localStorage
    const saved = localStorage.getItem("viewed_jobs");
    if (saved) {
      try {
        setViewedJobs(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error("Failed to parse viewed jobs", e);
      }
    }
    fetchStats();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [jobs, searchTitle, city, field, jobCategory, postAge]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      setJobs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (data.last_updated) {
        setLastUpdated(data.last_updated);
      }
    } catch (err) {
      console.error("Failed to fetch stats", err);
    }
  };


  const applyFilters = () => {
    let result = jobs;

    // 1. Title Search (Exact or partial match, case-insensitive)
    if (searchTitle.trim()) {
      const q = searchTitle.toLowerCase();
      result = result.filter(j => (j.title || "").toLowerCase().includes(q) || (j.company || "").toLowerCase().includes(q));
    }

    // 2. City Filter
    if (city !== "All Cities") {
      result = result.filter(j => (j.location || "").toLowerCase().includes(city.toLowerCase()));
    }

    // 3. Field Filter
    if (field !== "All Fields") {
      const f = field.toLowerCase();
      result = result.filter(j => {
        const t = (j.title || "").toLowerCase();
        if (f.includes("software")) return t.includes("software") || t.includes("developer") || t.includes("engineer");
        if (f.includes("web")) return t.includes("web") || t.includes("frontend") || t.includes("backend") || t.includes("full stack");
        if (f.includes("data")) return t.includes("data") || t.includes("analy") || t.includes("machine learning");
        if (f.includes("it")) return t.includes("it") || t.includes("network") || t.includes("system") || t.includes("support") || t.includes("help desk");
        if (f.includes("quality")) return t.includes("qa") || t.includes("quality") || t.includes("test");
        if (f.includes("finance")) return t.includes("finance") || t.includes("accountant") || t.includes("financial");
        if (f.includes("operations")) return t.includes("operation") || t.includes("ops");
        if (f.includes("marketing")) return t.includes("market") || t.includes("seo") || t.includes("growth");
        if (f.includes("hr")) return t.includes("hr") || t.includes("human resources") || t.includes("talent");
        return true;
      });
    }

    // 4. Date Filter
    if (postAge !== "Any time") {
      const selectedFilter = TIME_FILTERS.find(f => f.label === postAge);
      if (selectedFilter) {
        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - selectedFilter.hours);

        result = result.filter(j => {
          // If created_at exists, prefer it for hourly precision (SQLite 'YYYY-MM-DD HH:MM:SS' UTC)
          const dateStr = j.created_at ? j.created_at.replace(' ', 'T') + 'Z' : j.date_posted;
          const jobDate = new Date(dateStr);
          return jobDate >= cutoffDate;
        });
      }
    }

    // 5. Job Category Filter
    if (jobCategory !== "All Categories") {
      result = result.filter(j => j.job_type === jobCategory);
    }

    // 6. Result Mixing: If no specific field is selected AND no search query
    // and no category/city filter, we just use the jobs as-is (already shuffled by API)
    // However, if some filters ARE applied but not Title/Field, 
    // we still shuffle to keep variety first.
    if (field === "All Fields" && !searchTitle.trim() && city === "All Cities" && jobCategory === "All Categories" && postAge === "Any time") {
      // API already sorted these by recency
      result = [...result];
    }

    setFilteredJobs(result);
  };

  const markAsViewed = (id: number) => {
    setViewedJobs(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem("viewed_jobs", JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // Fisher-Yates Shuffle algorithm
  const shuffleArray = (array: any[]) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters();
  };

  return (
    <main className="container">
      <header className="hero">
        <h1>Ontario Junior Jobs</h1>
        <p>Discover entry-level and new grad opportunities across Ontario.</p>

        <div className="stats-bar">
          {lastUpdated && <span className="last-updated">Last data update: <strong>{lastUpdated}</strong></span>}
        </div>

        <form onSubmit={handleSearch} className="filters-container">
          {/* Main Title Search */}
          <div className="search-bar filter-row-full">
            <input
              type="text"
              placeholder="Search job titles or companies..."
              value={searchTitle}
              onChange={(e) => setSearchTitle(e.target.value)}
            />
          </div>

          {/* Advanced Filters */}
          <div className="filter-controls">
            <div className="filter-group">
              <label>City / Location</label>
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                {ONTARIO_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label>Field</label>
              <select value={field} onChange={(e) => setField(e.target.value)}>
                {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label>Category</label>
              <select value={jobCategory} onChange={(e) => setJobCategory(e.target.value)}>
                <option value="All Categories">All Categories</option>
                <option value="Full-Time">Full-Time</option>
                <option value="Graduating">New Grad</option>
                <option value="Co-op">Co-op / Intern</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Posted in the past</label>
              <select value={postAge} onChange={(e) => setPostAge(e.target.value)}>
                {TIME_FILTERS.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}
              </select>
            </div>
          </div>
        </form>
      </header>

      <div className="results-count">
        Showing {filteredJobs.length > 500 ? "500+" : filteredJobs.length} jobs
      </div>

      <section className="jobs-list">
        {loading ? (
          <div className="loader">Loading...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="no-results">No jobs found matching your criteria.</div>
        ) : (
          filteredJobs.map((job, index) => (
            <a
              href={job.link}
              target="_blank"
              rel="noopener noreferrer"
              className={`job-card ${viewedJobs.has(job.id) ? 'viewed' : ''}`}
              key={job.id}
              onClick={() => markAsViewed(job.id)}
              style={{ animationDelay: `${index * 0.02}s` }}
            >
              <div className="job-info">
                <h2>{job.title}</h2>
                <div className="job-meta">
                  <span className="company">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"></path><path d="M9 8h1"></path><path d="M9 12h1"></path><path d="M9 16h1"></path><path d="M14 8h1"></path><path d="M14 12h1"></path><path d="M14 16h1"></path><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path></svg>
                    {job.company}
                  </span>
                  <span className="location">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    {job.location}
                  </span>
                </div>
              </div>
              <div className="job-footer">
                <span className="date">Posted: {job.date_posted}</span>
                {job.job_type && (
                  <span className={`type-tag job-type-${job.job_type.toLowerCase().replace(' / ', '-').replace(' ', '-')}`}>
                    {job.job_type}
                  </span>
                )}
              </div>
            </a>
          ))
        )}
      </section>
    </main>
  );
}
