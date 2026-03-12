import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createCommunity } from '../api'

export default function CreateCommunityPage() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [icon, setIcon] = useState<File | null>(null)
    const [cover, setCover] = useState<File | null>(null)
    const [error, setError] = useState<string | null>(null)

    const mutation = useMutation({
        mutationFn: (formData: FormData) => createCommunity(formData),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['communities'] })
            queryClient.invalidateQueries({ queryKey: ['myCommunities'] })
            navigate(`/c/${data.slug}`)
        },
        onError: (err: any) => {
            setError(err.response?.data?.name?.[0] || 'Something went wrong. Please try again.')
        }
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        const formData = new FormData()
        formData.append('name', name)
        formData.append('description', description)
        if (icon) formData.append('icon', icon)
        if (cover) formData.append('cover_image', cover)

        mutation.mutate(formData)
    }

    return (
        <div className="max-w-2xl mx-auto py-12 px-4">
            <div className="mb-12 text-center">
                <h1 className="text-4xl font-extrabold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>Create a <span style={{ color: 'var(--accent)' }}>Community</span></h1>
                <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                    Start your own space. Focus on what matters, gather the people.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8 p-8 rounded-[3rem]" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-light)' }}>
                {error && (
                    <div className="p-4 rounded-2xl text-sm font-medium border" style={{ backgroundColor: 'var(--danger-alpha)', color: 'var(--danger)', borderColor: 'var(--danger-alpha)' }}>
                        {error}
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-widest px-1" style={{ color: 'var(--text-tertiary)' }}>Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Cosphere, Design Lovers..."
                        className="w-full p-4 rounded-2xl border-none outline-none focus:ring-2 transition-all"
                        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        disabled={mutation.isPending}
                    />
                    <p className="text-[10px] text-gray-400 px-1">Community names are unique and case-sensitive.</p>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-widest px-1" style={{ color: 'var(--text-tertiary)' }}>Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What is this space about?"
                        className="w-full p-4 rounded-2xl border-none outline-none focus:ring-2 transition-all min-h-[120px]"
                        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        disabled={mutation.isPending}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold uppercase tracking-widest px-1" style={{ color: 'var(--text-tertiary)' }}>Icon</label>
                        <div className="relative">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setIcon(e.target.files?.[0] || null)}
                                className="hidden"
                                id="icon-upload"
                            />
                            <label
                                htmlFor="icon-upload"
                                className="flex items-center justify-center p-4 rounded-2xl border-2 border-dashed border-[var(--border)] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-all aspect-square text-center"
                                style={{ backgroundColor: 'var(--bg-secondary)' }}
                            >
                                {icon ? (
                                    <img src={URL.createObjectURL(icon)} alt="" className="w-full h-full object-cover rounded-xl" />
                                ) : (
                                    <span className="text-xs font-bold" style={{ color: 'var(--text-tertiary)' }}>Upload Icon<br />(1:1)</span>
                                )}
                            </label>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold uppercase tracking-widest px-1" style={{ color: 'var(--text-tertiary)' }}>Cover Image</label>
                        <div className="relative">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setCover(e.target.files?.[0] || null)}
                                className="hidden"
                                id="cover-upload"
                            />
                            <label
                                htmlFor="cover-upload"
                                className="flex items-center justify-center p-4 rounded-2xl border-2 border-dashed border-[var(--border)] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-all aspect-square text-center"
                                style={{ backgroundColor: 'var(--bg-secondary)' }}
                            >
                                {cover ? (
                                    <img src={URL.createObjectURL(cover)} alt="" className="w-full h-full object-cover rounded-xl" />
                                ) : (
                                    <span className="text-xs font-bold" style={{ color: 'var(--text-tertiary)' }}>Upload Cover<br />(16:9)</span>
                                )}
                            </label>
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={mutation.isPending || !name.trim()}
                    className="w-full py-4 rounded-2xl font-bold text-white shadow-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
                    style={{ backgroundColor: 'var(--accent)' }}
                >
                    {mutation.isPending ? 'Creating...' : 'Launch Community'}
                </button>
            </form>
        </div>
    )
}
