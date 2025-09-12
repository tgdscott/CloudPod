"use client"

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  Download,
  Play,
  Share2,
  Copy,
  Check,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";


export default function EpisodeHistory({ onBack, token }) {
  const [episodes, setEpisodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [shareEpisode, setShareEpisode] = useState(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showErrorProcessingView, setShowErrorProcessingView] = useState(false);
  const [selectedEpisodes, setSelectedEpisodes] = useState(new Set());
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [episodeToPublish, setEpisodeToPublish] = useState(null);
  const [spreakerShows, setSpreakerShows] = useState([]);
  const [isFetchingShows, setIsFetchingShows] = useState(false);
  const [publishForm, setPublishForm] = useState({
    show_id: '',
    title: '',
    description: '',
    auto_published_at: '',
  });
  const { toast } = useToast();

  const fetchEpisodes = useCallback(async (isPolling = false) => {
    if (!isPolling) setIsLoading(true);
    try {
      const response = await fetch('/api/episodes/', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch episode history.');
      let data = await response.json();
      data.sort((a, b) => {
        const dateA = new Date(a.publish_at || a.processed_at || a.created_at);
        const dateB = new Date(b.publish_at || b.processed_at || b.created_at);
        if (isNaN(dateA.getTime())) return 1;
        if (isNaN(dateB.getTime())) return -1;
        return dateB.getTime() - dateA.getTime();
      });
      setEpisodes(data);
      return data;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      if (!isPolling) setIsLoading(false);
    }
  }, [token]);

  const fetchSpreakerShows = async () => {
    setIsFetchingShows(true);
    try {
      const response = await fetch('/api/spreaker/shows', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch Spreaker shows.' }));
        throw new Error(errorData.detail);
      }
      const data = await response.json();
      const shows = data.shows || [];
      console.log("--- DEBUG: Fetched Spreaker Shows ---", shows);
      setSpreakerShows(shows);
      return shows;
    } catch (err) {
      toast({
        title: "Error fetching Spreaker shows",
        description: err.message,
        variant: "destructive",
      });
      return [];
    } finally {
      setIsFetchingShows(false);
    }
  };

  useEffect(() => {
    let intervalId = null;
    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(() => fetchEpisodes(true), 15000);
      }
    };
    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const initFetchAndPoll = async () => {
      if (token) {
        const data = await fetchEpisodes(false);
        const hasProcessingOrErrorEpisodes = data.some(ep => ep.status === "processing" || ep.status === "error");
        if (hasProcessingOrErrorEpisodes) {
          startPolling();
        } else {
          stopPolling();
        }
      }
    };
    initFetchAndPoll();
    return () => stopPolling();
  }, [token, fetchEpisodes]);

  const getStatusBadge = (status) => {
    switch (status) {
      case "processed": return <Badge className="bg-green-100 text-green-800">Processed</Badge>;
      case "processing": return <Badge className="bg-blue-100 text-blue-800">Processing</Badge>;
      case "error": return <Badge className="bg-red-100 text-red-800">Error</Badge>;
      case "scheduled": return <Badge className="bg-purple-100 text-purple-800">Scheduled</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleDownload = (episode) => {
    const link = document.createElement('a');
    link.href = episode.final_audio_path;
    link.download = `${episode.title || 'episode'}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePlay = (episodeId) => {
    setPlayingId(playingId === episodeId ? null : episodeId);
  };

  const handleShare = (episode) => {
    setShareEpisode(episode);
    setIsShareDialogOpen(true);
    setCopied(false);
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleDeleteEpisode = async (episodeId) => {
    if (!window.confirm("Are you sure you want to delete this episode? This cannot be undone.")) return;
    try {
      const response = await fetch(`/api/episodes/${episodeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete episode.');
      }
      toast({ title: "Success", description: "Episode deleted." });
      fetchEpisodes();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const getShareableLink = (episode) => {
    return `${window.location.origin}/episode/${episode.id}`;
  };

  const handleMassDelete = async () => {
    if (selectedEpisodes.size === 0) {
      toast({ title: "Info", description: "No episodes selected for deletion." });
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${selectedEpisodes.size} selected episodes? This cannot be undone.`)) return;
    try {
      const deletePromises = Array.from(selectedEpisodes).map(episodeId =>
        fetch(`/api/episodes/${episodeId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      );
      const results = await Promise.allSettled(deletePromises);
      const failedDeletions = results.filter(result => result.status === 'rejected');
      if (failedDeletions.length > 0) {
        toast({ title: "Error", description: `Failed to delete ${failedDeletions.length} episodes.`, variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Selected episodes deleted." });
      }
      setSelectedEpisodes(new Set());
      fetchEpisodes();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleCheckboxChange = (episodeId, isChecked) => {
    setSelectedEpisodes(prev => {
      const newSelection = new Set(prev);
      if (isChecked) {
        newSelection.add(episodeId);
      } else {
        newSelection.delete(episodeId);
      }
      return newSelection;
    });
  };

  const handlePublishToSpreaker = async (episode) => {
    const shows = await fetchSpreakerShows();
    setEpisodeToPublish(episode);
    setPublishForm({
        show_id: shows.length > 0 ? shows[0].show_id : '',
        title: episode.title || '',
        description: episode.description || '',
        auto_published_at: '',
    });
    setIsPublishDialogOpen(true);
  };

  const handlePublishFormChange = (e) => {
    const { id, value } = e.target;
    setPublishForm(prev => ({ ...prev, [id]: value }));
  };
  
  const handleShowSelect = (value) => {
      setPublishForm(prev => ({ ...prev, show_id: value }));
  };

  const submitPublish = async (e) => {
    e.preventDefault();
    if (!episodeToPublish || !publishForm.show_id || !publishForm.title) {
      toast({
        title: "Missing Information",
        description: "Please select a show and provide a title.",
        variant: "destructive",
      });
      return;
    }

    let submissionForm = { ...publishForm };
    if (submissionForm.auto_published_at) {
      submissionForm.auto_published_at = new Date(submissionForm.auto_published_at).toISOString();
    } else {
        delete submissionForm.auto_published_at;
    }

    try {
      const filename = episodeToPublish.final_audio_path.split('/').pop();
      const body = JSON.stringify({ ...submissionForm, filename });
      console.log("--- DEBUG: Sending to /api/spreaker/upload ---", body);
      const response = await fetch(`/api/spreaker/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: body
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to publish episode to Spreaker.');
      }

      toast({ title: "Success", description: "Episode sent to Spreaker for publishing/scheduling." });
      setIsPublishDialogOpen(false);
      setEpisodeToPublish(null);
      fetchEpisodes();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const filteredEpisodes = episodes
    .filter(episode => {
      if (showErrorProcessingView) {
        return episode.status === "processing" || episode.status === "error";
      } else {
        return episode.status === "processed" || episode.status === "scheduled";
      }
    });

  return (
    <div className="p-6 bg-white rounded-xl shadow-md">
      <Button onClick={onBack} variant="ghost" className="mb-6 text-gray-700 hover:bg-gray-100">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Button>
      
      <Card className="border-none shadow-none">
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-2xl font-bold text-gray-800">Episode History</CardTitle>
          <div className="flex space-x-2 mt-4">
            <Button
              variant={!showErrorProcessingView ? "default" : "outline"}
              onClick={() => setShowErrorProcessingView(false)}
            >
              Processed & Scheduled
            </Button>
            <Button
              variant={showErrorProcessingView ? "default" : "outline"}
              onClick={() => setShowErrorProcessingView(true)}
            >
              Processing & Errors
            </Button>
            {showErrorProcessingView && (
              <Button
                variant="destructive"
                onClick={handleMassDelete}
                disabled={selectedEpisodes.size === 0}
              >
                Delete Selected ({selectedEpisodes.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading && (
            <div className="flex justify-center items-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          )}

          {error && (
            <p className="text-red-500 text-center py-8">{error}</p>
          )}

          {!isLoading && !error && (
            <div className="space-y-4">
              {filteredEpisodes.length > 0 ? (
                filteredEpisodes.map(episode => (
                  <Card key={episode.id} className="hover:bg-gray-50 transition-all duration-200">
                    <CardContent className="p-4 flex items-center justify-between">
                      {showErrorProcessingView && (
                        <Checkbox
                          checked={selectedEpisodes.has(episode.id)}
                          onCheckedChange={(isChecked) => handleCheckboxChange(episode.id, isChecked)}
                          className="mr-4"
                        />
                      )}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {episode.cover_path && (
                          <img 
                            src={episode.cover_path} 
                            alt={`${episode.title} cover`} 
                            className="w-16 h-16 rounded-md object-cover" 
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate text-gray-900">{episode.title}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                            <span>{new Date(episode.publish_at || episode.processed_at).toLocaleDateString()}</span>
                            {getStatusBadge(episode.status)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {episode.final_audio_path && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(episode)}
                              title="Download episode"
                              className="p-2 text-gray-500 hover:text-gray-800"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePlay(episode.id)}
                              title={playingId === episode.id ? "Pause" : "Play episode"}
                              className={`p-2 text-gray-500 hover:text-gray-800 ${playingId === episode.id ? "bg-gray-200" : ""}`}
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {(episode.status === "processing" || episode.status === "error") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEpisode(episode.id)}
                            title="Delete episode"
                            className="p-2 text-red-500 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleShare(episode)}
                          title="Share episode"
                          className="p-2 text-gray-500 hover:text-gray-800"
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                        {episode.status === "processed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePublishToSpreaker(episode)}
                            title="Publish to Spreaker"
                            className="p-2 text-green-500 hover:text-green-800"
                            disabled={isFetchingShows}
                          >
                            {isFetchingShows ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                          </Button>
                        )}
                      </div>
                    </CardContent>

                    {playingId === episode.id && episode.final_audio_path && (
                      <div className="p-4 pt-0 border-t mt-4">
                        <audio
                          controls
                          className="w-full h-8"
                          src={episode.final_audio_path}
                          autoPlay
                          onPause={() => setPlayingId(null)}
                          onEnded={() => setPlayingId(null)}
                        >
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    )}
                  </Card>
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">
                  No episodes found. Import a podcast to see its history here!
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {isShareDialogOpen && shareEpisode && (
        <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Share Episode: {shareEpisode.title}</DialogTitle>
              <DialogDescription>
                Copy the link below to share this episode with others.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center space-x-2 mt-4">
              <input
                type="text"
                readOnly
                value={getShareableLink(shareEpisode)}
                className="flex-1 p-2 border rounded-md bg-gray-100 text-sm focus:outline-none"
              />
              <Button onClick={() => copyToClipboard(getShareableLink(shareEpisode))} size="icon" className="w-8 h-8">
                {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
              </Button>
            </div>
            {copied && <p className="text-green-600 text-sm mt-2">Link copied!</p>}
          </DialogContent>
        </Dialog>
      )}

      {isPublishDialogOpen && episodeToPublish && (
        <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Publish to Spreaker</DialogTitle>
              <DialogDescription>
                Publish "{episodeToPublish.title}" to your Spreaker account.
              </DialogDescription>
            </DialogHeader>
            {spreakerShows.length > 0 ? (
              <form onSubmit={submitPublish} className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="show_id" className="text-right">
                    Spreaker Show
                  </Label>
                  <Select onValueChange={handleShowSelect} value={publishForm.show_id}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select a show" />
                    </SelectTrigger>
                    <SelectContent>
                      {spreakerShows.map(show => (
                        <SelectItem key={show.show_id} value={show.show_id}>{show.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="title" className="text-right">
                    Title
                  </Label>
                  <Input
                    id="title"
                    value={publishForm.title}
                    onChange={handlePublishFormChange}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="description" className="text-right">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={publishForm.description}
                    onChange={handlePublishFormChange}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="auto_published_at" className="text-right">
                    Schedule Publish (UTC)
                  </Label>
                  <Input
                    id="auto_published_at"
                    type="datetime-local"
                    value={publishForm.auto_published_at}
                    onChange={handlePublishFormChange}
                    className="col-span-3"
                  />
                </div>
                <Button type="submit" disabled={!publishForm.show_id}>Publish Episode</Button>
              </form>
            ) : (
              <div className="py-4">
                <p className="text-center text-red-600 font-semibold">No Spreaker Shows Found</p>
                <p className="text-center text-sm text-gray-500 mt-2">
                  I couldn't find any shows on your connected Spreaker account. Please go to Spreaker, create a new show, and then try publishing again.
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}