import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecipeEditor from './RecipeEditor';
import * as aiModule from '../ai';
import { buildCoverPrompt } from '../ai';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RecipeEditor component', () => {
  const defaultRecipe = {
    id: 'test-1',
    title: 'Matcha Pound Cake',
    description: 'Rich and buttery matcha loaf.',
    category: 'Baking',
    tags: ['Dessert'],
    cuisine: 'Japanese',
    method: 'Baking',
    keywords: ['matcha'],
    prepMinutes: 15,
    cookMinutes: 45,
    restMinutes: 10,
    servings: 8,
    artwork: '',
    sourceVideo: '',
    ingredients: [
      { quantity: 2, unit: 'cups', name: 'Flour', group: '', note: '' },
      { quantity: 2, unit: 'tbsp', name: 'Matcha powder', group: '', note: '' },
    ],
    steps: [{ title: 'Mix', instruction: 'Whisk matcha with flour.' }],
    notes: [],
    substitutions: [],
    equipment: [],
  };

  it('displays local backup notice when not in cloud mode', () => {
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={false}
      />
    );

    expect(
      screen.getByText('Saved on this browser.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Export a backup/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Saved to your synced cloud cookbook/i)
    ).not.toBeInTheDocument();
  });

  it('displays cloud sync text when isCloud is true', () => {
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    expect(
      screen.getByText(/Saved to your synced cloud cookbook/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Saved on this browser/i)
    ).not.toBeInTheDocument();
  });

  it('shows cookbook deletion text when isCloud is true', async () => {
    const user = userEvent.setup();
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    await user.click(screen.getByRole('button', { name: /Delete recipe/i }));
    expect(
      screen.getByText('Delete this recipe from your cookbook?')
    ).toBeInTheDocument();
  });

  it('provides cover photo controls including upload, URL and AI generation', async () => {
    const user = userEvent.setup();
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    expect(screen.getByRole('button', { name: /Upload photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate with AI/i })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/paste an image URL/i)
    ).toBeInTheDocument();

    vi.spyOn(aiModule, 'generateRecipeCover').mockResolvedValueOnce(
      'https://supabase.co/storage/v1/object/public/recipe-covers/user/cake.jpg'
    );

    await user.click(screen.getByRole('button', { name: /Generate with AI/i }));
    expect(
      await screen.findByText(/Photo generated/i)
    ).toBeInTheDocument();
  });

  it('disables Generate with AI button until user fills in most recipe info to save tokens', () => {
    render(
      <RecipeEditor
        recipe={null}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={false}
        isCloud={true}
      />
    );

    const generateBtn = screen.getByRole('button', { name: /Generate with AI/i });
    expect(generateBtn).toBeDisabled();
    expect(screen.getByText(/To save on API tokens, fill in title, category, 2\+ ingredients, and 1\+ step/i)).toBeInTheDocument();
  });

  it('provides Refine with AI button and polishes recipe draft', async () => {
    const user = userEvent.setup();
    vi.spyOn(aiModule, 'enhanceRecipeWithGemini').mockResolvedValueOnce({
      ...defaultRecipe,
      description: 'Ultra-moist ceremonial grade matcha pound cake with white chocolate glaze.',
    });

    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    const refineBtn = screen.getByRole('button', { name: /Refine with AI/i });
    expect(refineBtn).toBeInTheDocument();

    await user.click(refineBtn);
    expect(aiModule.enhanceRecipeWithGemini).toHaveBeenCalled();
    expect(
      await screen.findByText(/Recipe polished by Gemini AI/i)
    ).toBeInTheDocument();
  });

  it('does not close editor when file input cancel event occurs', () => {
    const handleClose = vi.fn();
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={handleClose}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    const fileInput = document.getElementById('recipe-cover-upload');
    expect(fileInput).toBeInTheDocument();

    // Fire cancel event on file input
    const cancelEvent = new Event('cancel', { bubbles: true, cancelable: true });
    fileInput.dispatchEvent(cancelEvent);

    expect(handleClose).not.toHaveBeenCalled();
  });

  it('preserves pasted image URL in saved recipe without clearing artwork', async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn().mockResolvedValue('');
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={handleSave}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    const urlInput = screen.getByPlaceholderText(/paste an image URL/i);
    await user.clear(urlInput);
    await user.type(urlInput, 'https://images.unsplash.com/photo-matcha-cake.jpg');

    await user.click(screen.getByRole('button', { name: /Save recipe/i }));
    expect(handleSave).toHaveBeenCalled();
    const saved = handleSave.mock.calls[0][0];
    expect(saved.artwork).toBe('https://images.unsplash.com/photo-matcha-cake.jpg');
  });

  it('never calls AI refine automatically when saving a recipe', async () => {
    const user = userEvent.setup();
    const enhanceSpy = vi.spyOn(aiModule, 'enhanceRecipeWithGemini');
    const handleSave = vi.fn().mockResolvedValue('');

    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={handleSave}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    // Save recipe directly without clicking Refine with AI
    await user.click(screen.getByRole('button', { name: /Save recipe/i }));
    expect(handleSave).toHaveBeenCalled();
    // enhanceRecipeWithGemini should NEVER be called on save
    expect(enhanceSpy).not.toHaveBeenCalled();
  });

  it('does not render an illustration picker dropdown', () => {
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    expect(screen.queryByLabelText(/Illustration/i)).not.toBeInTheDocument();
  });

  it('uses a centered workspace shell with independently scrolling fields and persistent actions', () => {
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    const dialog = screen.getByRole('dialog', { name: /Make it yours/i });
    expect(dialog).toHaveAttribute('data-layout', 'centered-workspace');

    const form = screen.getByRole('form', { name: 'Recipe editor form' });
    expect(form).toHaveClass('flex', 'flex-col');

    const fields = screen.getByRole('region', { name: 'Recipe fields' });
    expect(fields).toHaveClass('min-h-0', 'overflow-y-auto');

    expect(screen.getByRole('group', { name: 'Editor actions' })).toBeInTheDocument();
  });

  it('keeps repeated ingredient inputs readable on mobile', () => {
    render(
      <RecipeEditor
        recipe={defaultRecipe}
        categories={['Baking', 'Dinner']}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        isLocal={true}
        isCloud={true}
      />
    );

    const note = screen.getByLabelText('Ingredient 1 preparation note');
    const group = screen.getByLabelText('Ingredient 1 group');
    expect(note).not.toHaveClass('text-xs');
    expect(group).not.toHaveClass('text-xs');
    expect(note).toHaveClass('text-sm', 'max-[580px]:text-base');
    expect(group).toHaveClass('text-sm', 'max-[580px]:text-base');
  });
});

describe('AI cover prompt builder', () => {
  it('buildCoverPrompt creates descriptive photography prompt', () => {
    const recipe = {
      title: 'Lobster Risotto',
      description: 'Creamy arborio rice with butter poached lobster.',
      cuisine: 'Italian',
      ingredients: [{ name: 'Arborio rice' }, { name: 'Lobster tails' }, { name: 'Parmigiano' }],
    };
    const prompt = buildCoverPrompt(recipe);
    expect(prompt).toContain('Lobster Risotto');
    expect(prompt).toContain('Italian style');
    expect(prompt).toContain('Arborio rice, Lobster tails, Parmigiano');
    expect(prompt).toContain('photorealistic');
  });
});
