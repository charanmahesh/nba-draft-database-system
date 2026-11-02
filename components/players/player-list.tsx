"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, ApiError, type Player, type PlayerFilters, type Position, type Team } from "@/lib/api-client";
import { Button, EmptyState, Input, Pagination, Select, Skeleton, Table } from "@/components/ui";

const positions: Position[] = ["PG", "SG", "SF", "PF", "C"];
const defaults: PlayerFilters = { page: 1, limit: 20, sort: "name" };
const sortOptions: { value: PlayerFilters["sort"]; label: string }[] = [
  { value: "name", label: "Name A–Z" },
  { value: "points", label: "Points per game" },
  { value: "rebounds", label: "Rebounds per game" },
  { value: "assists", label: "Assists per game" },
  { value: "steals", label: "Steals per game" },
  { value: "blocks", label: "Blocks per game" },
  { value: "minutes", label: "Minutes per game" },
  { value: "games", label: "Games played" },
];
const fmt = (value: string | number | null, unit = "") =>
  value === null ? "—" : `${Number(value).toFixed(1)}${unit}`;

export function PlayerList() {
  const [filters, setFilters] = useState<PlayerFilters>(defaults);
  const [draft, setDraft] = useState("");
  const [season, setSeason] = useState("");
  const [minGames, setMinGames] = useState("");
  const [data, setData] = useState<{ items: Player[]; total: number; page: number; limit: number } | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamError, setTeamError] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.teams({ limit: 100 })
      .then(rows => {
        if (active) setTeams(rows);
      })
      .catch(() => {
        if (active) setTeamError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.players(filters)
      .then(result => {
        if (active) setData(result);
      })
      .catch(e => {
        if (active) {
          setData(null);
          setError(e instanceof ApiError && e.status === 403 ? e.message : "Could not load players. Please try again.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters]);

  function update(patch: Partial<PlayerFilters>) {
    setFilters(current => ({ ...current, ...patch, page: 1 }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    update({
      name: draft.trim() || undefined,
      season: season ? Number(season) : undefined,
      minGames: minGames ? Number(minGames) : undefined,
    });
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
      <p className="eyebrow text-ink/55">Player index</p>
      <h1 className="mt-4 font-display text-5xl leading-[.9] sm:text-6xl">
        EVERY PLAYER
        <br />
        <span className="text-cream">ON ONE SHEET.</span>
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink/65">
        Explore imported NBA players. Statistics reflect the selected team and season filters, or all imported games when no filter is selected.
      </p>

      <form onSubmit={submit} className="mt-8 grid gap-3 rounded-card border border-cream/60 bg-cream/25 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs font-medium text-ink/70 lg:col-span-2">
          Player name
          <Input className="mt-1" placeholder="Search a name" value={draft} maxLength={100} onChange={event => setDraft(event.target.value)} />
        </label>
        <label className="text-xs font-medium text-ink/70">
          Position
          <Select
            className="mt-1"
            value={filters.position ?? ""}
            onChange={event => update({ position: (event.target.value || undefined) as Position | undefined })}
          >
            <option value="">All positions</option>
            {positions.map(position => <option key={position}>{position}</option>)}
          </Select>
        </label>
        <label className="text-xs font-medium text-ink/70">
          Team
          <Select className="mt-1" value={filters.team ?? ""} onChange={event => update({ team: event.target.value || undefined })}>
            <option value="">All teams</option>
            {teams.map(team => <option key={team.team_id} value={team.team_id}>{team.team_name}</option>)}
          </Select>
        </label>
        <label className="text-xs font-medium text-ink/70">
          Season
          <Input className="mt-1" type="number" min={1900} max={2200} placeholder="All seasons" value={season} onChange={event => setSeason(event.target.value)} />
        </label>
        <label className="text-xs font-medium text-ink/70">
          Minimum games
          <Input className="mt-1" type="number" min={0} max={10000} placeholder="0" value={minGames} onChange={event => setMinGames(event.target.value)} />
        </label>
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-6">
          <label className="w-56 text-xs font-medium text-ink/70">
            Sort by
            <Select
              className="mt-1"
              value={filters.sort}
              onChange={event => update({ sort: event.target.value as PlayerFilters["sort"] })}
            >
              {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </label>
          <Button type="submit">Apply filters</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft("");
              setSeason("");
              setMinGames("");
              setFilters({ ...defaults });
            }}
          >
            Clear
          </Button>
          {teamError && <span role="status" className="text-xs text-burgundy">Team options unavailable.</span>}
        </div>
      </form>

      <div className="mt-7 flex justify-between gap-3 text-xs uppercase tracking-wider text-ink/55" aria-live="polite">
        <span>{loading ? "Loading players…" : data ? `${data.total.toLocaleString()} players` : "Players unavailable"}</span>
        {data && !loading && <span>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))}</span>}
      </div>
      <div className="mt-3 overflow-x-auto rounded-card border border-cream/60 bg-cream/25 p-4 sm:p-5">
        {loading ? (
          <div aria-label="Loading players" className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : error ? (
          <div role="alert">
            <EmptyState title="Unable to load players" description={error}>
              <Button onClick={() => setFilters(current => ({ ...current }))}>Try again</Button>
            </EmptyState>
          </div>
        ) : !data?.items.length ? (
          <EmptyState title="No players found" description="Try a different name, position, team or season." />
        ) : (
          <Table>
            <thead>
              <tr className="border-b border-ink/20 text-xs uppercase tracking-wider text-ink/55">
                {["Player", "Position", "Height", "Weight", "Games", "PTS/G", "REB/G", "AST/G", "STL/G", "BLK/G"].map(label => (
                  <th key={label} scope="col" className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map(player => (
                <tr key={player.player_id} className="border-b border-ink/10 last:border-0 hover:bg-cream/40">
                  <td className="whitespace-nowrap px-3 py-4 font-medium">
                    <Link className="text-ink underline-offset-4 hover:text-burgundy hover:underline" href={`/players/${player.player_id}`}>
                      {player.f_name} {player.l_name} ↗
                    </Link>
                    <span className="ml-2 text-xs text-ink/50">#{player.player_id}</span>
                  </td>
                  <td className="px-3 py-4">
                    {player.position ?? (player.position_group ? `${player.position_group} · starter data` : "—")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">{fmt(player.height_cm, " cm")}</td>
                  <td className="whitespace-nowrap px-3 py-4">{fmt(player.weight_kg, " kg")}</td>
                  <td className="px-3 py-4">{player.games}</td>
                  <td className="px-3 py-4">{fmt(player.avg_points)}</td>
                  <td className="px-3 py-4">{fmt(player.avg_rebounds)}</td>
                  <td className="px-3 py-4">{fmt(player.avg_assists)}</td>
                  <td className="px-3 py-4">{fmt(player.avg_steals)}</td>
                  <td className="px-3 py-4">{fmt(player.avg_blocks)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {data && !loading && data.total > data.limit && (
        <div className="mt-5">
          <Pagination
            page={data.page}
            totalPages={Math.ceil(data.total / data.limit)}
            onPageChange={page => setFilters(current => ({ ...current, page }))}
          />
        </div>
      )}
    </div>
  );
}
