import { useState, useRef, useEffect } from 'react';
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const PRESETS = ['📊', '📈', '📉', '🏆', '⚽', '🏀', '🎾', '🪙', '💰', '🌍', '🌡️', '🌧️', '🗳️', '🏛️', '📰', '⚡', '🚀', '🎯', '💎', '🎲', '🎮', '🎬', '🎵', '🎨', '🐶', '🐱', '🦅', '🌙', '☀️', '⭐', '🔥', '💧'];

const ImageUpload = ({ value, onChange }) => {
  // Check if current value is an image URL
  const isImageValue = (val) => val && !PRESETS.includes(val) && (val.startsWith('http') || val.startsWith('/uploads/'));

  const [mode, setMode] = useState(isImageValue(value) ? 'upload' : 'emoji');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Auto-switch to upload mode when an image URL is set
  useEffect(() => {
    if (isImageValue(value) && mode !== 'upload') {
      setMode('upload');
    }
  }, [value]);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPEG, PNG, GIF, and WebP images allowed');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large (max 5MB)');
      return;
    }

    // Create local preview immediately
    const localPreview = URL.createObjectURL(file);

    setUploading(true);
    const toastId = toast.loading('Uploading image...');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const { data } = await api.post('/upload/image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (data.success) {
        onChange(data.url);
        setMode('upload'); // Switch to upload mode to show the image
        toast.success('Image uploaded!', { id: toastId });
      } else {
        toast.error(data.error || 'Upload failed', { id: toastId });
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(err.response?.data?.error || 'Failed to upload image', { id: toastId });
    } finally {
      setUploading(false);
      // Clean up local preview
      URL.revokeObjectURL(localPreview);
    }
  };

  const handleClear = () => {
    onChange('📊');
    setMode('emoji');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isImageUrl = isImageValue(value);

  return (
    <div>
      {/* Preview */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-14 h-14 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
          {isImageUrl ? (
            <img
              src={value}
              alt="Market"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '';
                e.target.parentElement.innerHTML = '📊';
              }}
            />
          ) : (
            <span className="text-3xl">{value || '📊'}</span>
          )}
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('emoji')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === 'emoji'
                ? 'bg-[var(--color-gold)] text-black'
                : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
            }`}
          >
            Emoji
          </button>
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === 'upload'
                ? 'bg-[var(--color-gold)] text-black'
                : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
            }`}
          >
            Upload
          </button>
        </div>

        {/* Clear button (only for images) */}
        {isImageUrl && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-red)] hover:bg-[var(--color-red)]/10 transition-colors"
            title="Remove image"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Emoji picker */}
      {mode === 'emoji' && (
        <div className="grid grid-cols-8 gap-1.5 p-3 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl max-h-36 overflow-y-auto">
          {PRESETS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange(emoji)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-[var(--color-border)] transition-all ${
                value === emoji ? 'bg-[var(--color-gold)]/20 ring-1 ring-[var(--color-gold)]' : ''
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Upload area */}
      {mode === 'upload' && (
        <div className="space-y-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full py-8 border-2 border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-surface2)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold)]/5 transition-all flex flex-col items-center gap-2 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="w-8 h-8 text-[var(--color-gold)] animate-spin" />
                <span className="text-sm text-[var(--color-text-muted)]">Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-[var(--color-text-muted)]" />
                <span className="text-sm text-[var(--color-text)] font-medium">Click to upload image</span>
                <span className="text-xs text-[var(--color-text-muted)]">JPEG, PNG, GIF, WebP (max 5MB)</span>
              </>
            )}
          </button>

          {/* Current image preview if exists */}
          {isImageUrl && !uploading && (
            <div className="p-3 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--color-surface)] flex-shrink-0">
                  <img
                    src={value}
                    alt="Uploaded"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
                <span className="text-sm text-[var(--color-text)] flex-1 truncate">{value.split('/').pop()}</span>
                <span className="text-xs text-[var(--color-text-muted)]">Current image</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
