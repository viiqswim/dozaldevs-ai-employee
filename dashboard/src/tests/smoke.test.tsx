import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../panels/tasks/StatusBadge';
import { formatRelativeTime, formatDuration } from '../lib/utils';

test('StatusBadge renders Done status', () => {
  render(<StatusBadge status="Done" />);
  expect(screen.getByText('Done')).toBeInTheDocument();
});

test('StatusBadge renders Failed status', () => {
  render(<StatusBadge status="Failed" />);
  expect(screen.getByText('Failed')).toBeInTheDocument();
});

test('StatusBadge renders Reviewing status', () => {
  render(<StatusBadge status="Reviewing" />);
  expect(screen.getByText('Reviewing')).toBeInTheDocument();
});

test('formatRelativeTime returns a non-empty string', () => {
  const result = formatRelativeTime(new Date().toISOString());
  expect(typeof result).toBe('string');
  expect(result.length).toBeGreaterThan(0);
});

test('formatDuration returns a non-empty string', () => {
  const start = new Date(Date.now() - 90_000).toISOString();
  const end = new Date().toISOString();
  const result = formatDuration(start, end);
  expect(typeof result).toBe('string');
  expect(result.length).toBeGreaterThan(0);
});
