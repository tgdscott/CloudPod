import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Trash2, Loader2, Plus, Image as ImageIcon, Rss } from "lucide-react";
import { useState, useEffect } from "react";
import EditPodcastDialog from "./EditPodcastDialog";
import NewUserWizard from "./NewUserWizard";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/apiClient";

const API_BASE_URL = ""; // Use relative so it works behind any proxy

export default function PodcastManager({ onBack, token, podcasts, setPodcasts }) {
  const [showToDelete, setShowToDelete] = useState(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [podcastToEdit, setPodcastToEdit] = useState(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const { toast } = useToast();

  const openEditDialog = (podcast) => {
    setPodcastToEdit(podcast);
    setIsEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setPodcastToEdit(null);
    setIsEditDialogOpen(false);
  };

  const handleEditPodcast = (updatedPodcast) => {
    setPodcasts(prev => prev.map(p => p.id === updatedPodcast.id ? updatedPodcast : p));
    closeEditDialog();
  };

  const openDeleteDialog = (podcast) => {
    setShowToDelete(podcast);
    setDeleteConfirmationText("");
  };

  const closeDeleteDialog = () => {
    setShowToDelete(null);
  };

  const openWizard = () => {
    const FULLPAGE = (import.meta.env?.VITE_ONBOARDING_FULLPAGE === 'true') || (import.meta.env?.ONBOARDING_FULLPAGE === 'true');
    // If full-page onboarding is enabled, steer users to /onboarding instead of opening the modal
    if (FULLPAGE) {
      try { window.location.href = '/onboarding'; } catch {}
    } else {
      setIsWizardOpen(true);
    }
  };

  const handlePodcastCreated = (newPodcast) => {
    setPodcasts(prev => [newPodcast, ...prev]);
    setIsWizardOpen(false);
  };

  const handleDeleteShow = async () => {
    if (!showToDelete) return;
    setIsDeleting(true);
    try {
      const response = await fetch(buildApiUrl(`/api/podcasts/${showToDelete.id}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error("Failed to delete the show.");
      }

      setPodcasts(prev => prev.filter(p => p.id !== showToDelete.id));
      toast({ title: "Success", description: `Show "${showToDelete.name}" has been deleted.` });
      closeDeleteDialog();

    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };


  return (
    <div className="p-6">
      <Button onClick={onBack} variant="ghost" className="mb-4"><ArrowLeft className="w-4 h-4 mr-2" />Back to Dashboard</Button>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Manage Your Podcasts</CardTitle>
              <CardDescription>Here you can create, import, edit, or delete your podcasts.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={openWizard}><Plus className="w-4 h-4 mr-2" /> New Podcast</Button>
              <Button variant="outline" size="sm" onClick={() => {
                try { window.dispatchEvent(new CustomEvent('ppp:navigate-view', { detail: 'rssImporter' })); } catch {}
              }}><Rss className="w-4 h-4 mr-2" /> Import</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {podcasts.length > 0 ? (
            <div className="space-y-4">
              {podcasts.map(podcast => (
                <Card key={podcast.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    {podcast.cover_path ? (
                      <img
                        src={
                          podcast.cover_path.startsWith('http')
                            ? podcast.cover_path
                            : `/static/media/${podcast.cover_path.replace(/^\/+/, '').split('/').pop()}`
                        }
                        alt={`${podcast.name} cover`}
                        className="w-16 h-16 rounded-md object-cover"
                        onError={(e)=>{e.currentTarget.style.display='none'; const sib=e.currentTarget.nextSibling; if(sib) sib.style.display='flex';}}
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-md bg-gray-100 flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold">{podcast.name}</h3>
                      <p className="text-sm text-gray-500 line-clamp-2">{podcast.description || "No description."}</p>
                    </div>
                  </div>
      <div className="space-x-2">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(podcast)}>Edit</Button>
                    <Button variant="destructive" size="sm" onClick={() => openDeleteDialog(podcast)}>
        <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
      <div className="text-center py-10">
    <p className="mb-4">You haven't created any podcasts yet.</p>
        <Button onClick={openWizard}>
          <Plus className="w-4 h-4 mr-2" /> {(import.meta.env?.VITE_ONBOARDING_FULLPAGE === 'true' || import.meta.env?.ONBOARDING_FULLPAGE === 'true') ? 'Get started' : 'Create Your First Show'}
        </Button>
      </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showToDelete} onOpenChange={closeDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the podcast
              <strong className="text-red-600"> "{showToDelete?.name}" </strong>
              and all of its associated episodes.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="delete-confirm">Please type <strong className="text-red-600">delete</strong> to confirm.</Label>
            <Input 
              id="delete-confirm"
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDeleteDialog}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmationText !== 'delete' || isDeleting}
              onClick={handleDeleteShow}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete Podcast"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Podcast Dialog */}
      {isEditDialogOpen && podcastToEdit && (
        <EditPodcastDialog
          isOpen={isEditDialogOpen}
          onClose={closeEditDialog}
          podcast={podcastToEdit}
          onSave={handleEditPodcast}
          token={token}
          userEmail={podcastToEdit?.user?.email || undefined}
        />
      )}

      {/* New User Wizard (fallback, behind feature flag) */}
      {!(import.meta.env?.VITE_ONBOARDING_FULLPAGE === 'true' || import.meta.env?.ONBOARDING_FULLPAGE === 'true') && (
        <NewUserWizard
          open={isWizardOpen}
          onOpenChange={setIsWizardOpen}
          token={token}
          onPodcastCreated={handlePodcastCreated}
        />
      )}
    </div>
  );
}
