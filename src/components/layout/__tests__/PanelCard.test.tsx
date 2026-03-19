import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../charts/PanelRenderer', () => ({
  PanelRenderer: ({ panel }: any) => <div data-testid="panel-renderer">{panel.title}</div>,
}));

import { PanelCard } from '../PanelCard';
import { makeStatPanel, makeBarPanel } from '../../../__fixtures__/factories';

describe('PanelCard', () => {
  it('renders skeleton when loading', () => {
    const { container } = render(<PanelCard panelId="test" panels={[]} loading={true} />);
    expect(container.querySelector('.panel-card--loading')).toBeInTheDocument();
    expect(container.querySelector('.panel-card__skeleton')).toBeInTheDocument();
  });

  it('renders panel via PanelRenderer when loaded', () => {
    const panels = [makeStatPanel({ id: 'my-stat', title: 'My Stat' })];
    render(<PanelCard panelId="my-stat" panels={panels} loading={false} />);
    expect(screen.getByTestId('panel-renderer')).toHaveTextContent('My Stat');
  });

  it('renders skeleton when panel not found', () => {
    const { container } = render(<PanelCard panelId="missing" panels={[makeStatPanel()]} loading={false} />);
    expect(container.querySelector('.panel-card--loading')).toBeInTheDocument();
  });

  it('displays panel title for non-stat panels', () => {
    const panels = [makeBarPanel({ id: 'x', title: 'Error Types' })];
    render(<PanelCard panelId="x" panels={panels} loading={false} />);
    const titleEl = document.querySelector('.panel-card__title');
    expect(titleEl).toHaveTextContent('Error Types');
  });

  it('hides panel title for stat panels', () => {
    const panels = [makeStatPanel({ id: 'x', title: 'Active Agents' })];
    render(<PanelCard panelId="x" panels={panels} loading={false} />);
    const titleEl = document.querySelector('.panel-card__title');
    expect(titleEl).toBeNull();
  });

  it('sets data attributes', () => {
    const panels = [makeBarPanel({ id: 'bar1' })];
    const { container } = render(<PanelCard panelId="bar1" panels={panels} loading={false} />);
    const card = container.querySelector('.panel-card');
    expect(card).toHaveAttribute('data-panel-id', 'bar1');
    expect(card).toHaveAttribute('data-panel-type', 'bar');
  });

  it('renders subtitle for non-stat panels', () => {
    const panels = [makeBarPanel({ id: 'x', title: 'Error Types', subtitle: 'count · 24h' })];
    render(<PanelCard panelId="x" panels={panels} loading={false} />);
    const subtitle = document.querySelector('.panel-card__subtitle');
    expect(subtitle).toHaveTextContent('count · 24h');
  });

  it('does not render subtitle for stat panels', () => {
    const panels = [makeStatPanel({ id: 'x', subtitle: 'some text' })];
    render(<PanelCard panelId="x" panels={panels} loading={false} />);
    const subtitle = document.querySelector('.panel-card__subtitle');
    expect(subtitle).toBeNull();
  });
});
