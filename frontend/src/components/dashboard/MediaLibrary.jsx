import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Music, Trash2, Upload, Edit, Save, XCircle } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { makeApi } from "@/lib/apiClient";

export default function MediaLibrary({ onBack, token }) {
  const [mediaFiles, setMediaFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("music");
  const [isUploading, setIsUploading] = useState(false);
  
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingTrigger, setEditingTrigger] = useState("");
  const { toast } = useToast();

  const fetchMedia = async () => {
    setIsLoading(true);
    try {
      const api = makeApi(token);
      const data = await api.get('/api/media/');
      setMediaFiles(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchMedia();
  }, [token]);

  const handleFileSelect = (e) => {
    const MB = 1024 * 1024;
    const maxBytesByCat = {
      intro: 50 * MB,
      outro: 50 * MB,
      music: 50 * MB,
      commercial: 50 * MB,
      sfx: 25 * MB,
    };
    const maxBytes = maxBytesByCat[selectedCategory] ?? (50 * MB);
    const files = Array.from(e.target.files || []);
    const accepted = [];
    for (const file of files) {
      const ct = (file.type || '').toLowerCase();
      if (!ct.startsWith('audio/')) {
        toast({ variant: 'destructive', title: 'Invalid file type', description: `${file.name}: only audio files are allowed for ${selectedCategory}.` });
        continue;
      }
      if (file.size > maxBytes) {
        const lim = Math.floor(maxBytes / MB);
        toast({ variant: 'destructive', title: 'File too large', description: `${file.name}: exceeds ${lim}MB limit for ${selectedCategory}.` });
        continue;
      }
      accepted.push({ file, friendly_name: file.name.split('.').slice(0, -1).join('.') });
    }
    setUploadFiles(accepted);
  };

  const handleUploadNameChange = (index, newName) => {
    const updatedFiles = [...uploadFiles];
    updatedFiles[index].friendly_name = newName;
    setUploadFiles(updatedFiles);
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;
    setIsUploading(true);
    setError(null);
    const formData = new FormData();
    const friendlyNames = [];

    for (const fileWithName of uploadFiles) {
      formData.append("files", fileWithName.file);
      friendlyNames.push(fileWithName.friendly_name);
    }
    formData.append("friendly_names", JSON.stringify(friendlyNames));

    try {
      const api = makeApi(token);
      await api.raw(`/api/media/upload/${selectedCategory}`, { method: 'POST', body: formData });
      
      setUploadFiles([]);
      document.getElementById("media-upload").value = "";
      toast({ title: "Success!", description: "Media uploaded successfully."});
      fetchMedia();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const startEditing = (file) => {
    setEditingId(file.id);
    setEditingName(file.friendly_name || file.filename.split('_').slice(1).join('_'));
    setEditingTrigger(file.trigger_keyword || "");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName("");
    setEditingTrigger("");
  };

  const handleSaveName = async (fileId) => {
      try {
        const payload = { friendly_name: editingName, trigger_keyword: editingTrigger || null };
        const api = makeApi(token);
        await api.put(`/api/media/${fileId}`, payload);
        toast({ title: "Saved" });
        setMediaFiles(prev => prev.map(f => f.id === fileId ? {...f, friendly_name: editingName, trigger_keyword: editingTrigger || null} : f));
        cancelEditing();
      } catch (err) {
        toast({ title: "Error", description: err.message, variant: 'destructive'});
      }
  };

  const handleDelete = async (mediaId) => {
    if (!window.confirm("Are you sure you want to permanently delete this file?")) return;
  try {
    const api = makeApi(token);
    await api.del(`/api/media/${mediaId}`);
    setMediaFiles(prevFiles => prevFiles.filter(file => file.id !== mediaId));
    toast({ description: "File deleted." });
  } catch (err) {
    setError(err.message);
  }
  };

  const groupedMedia = useMemo(() => {
    return mediaFiles.reduce((acc, file) => {
      (acc[file.category] = acc[file.category] || []).push(file);
      return acc;
    }, {});
  }, [mediaFiles]);

  return (
    <div className="p-6">
      <Button onClick={onBack} variant="ghost" className="mb-4"><ArrowLeft className="w-4 h-4 mr-2" />Back to Dashboard</Button>
      <Card className="mb-6">
        <CardHeader><CardTitle>Upload New Media</CardTitle></CardHeader>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2"><Label htmlFor="media-category">Category</Label><Select value={selectedCategory} onValueChange={setSelectedCategory}><SelectTrigger id="media-category"><SelectValue /></SelectTrigger><SelectContent>{["intro", "outro", "music", "commercial", "sfx"].map(cat => <SelectItem key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2 md:col-span-2"><Label htmlFor="media-upload">File(s)</Label><Input id="media-upload" type="file" accept="audio/*" multiple onChange={handleFileSelect} /></div>
            </div>

            {uploadFiles.length > 0 && (
                <div className="space-y-2 pt-4 border-t">
                    <Label>Files to Upload:</Label>
                    {uploadFiles.map((fileWithName, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <Input 
                                value={fileWithName.friendly_name} 
                                onChange={(e) => handleUploadNameChange(index, e.target.value)}
                                className="flex-grow"
                                placeholder="Enter a friendly name"
                            />
                            <p className="text-sm text-gray-500 truncate">{fileWithName.file.name}</p>
                        </div>
                    ))}
                </div>
            )}
          <Button onClick={handleUpload} disabled={isUploading || uploadFiles.length === 0} className="w-full mt-4">{isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4 mr-2" /> Upload {uploadFiles.length} File(s)</>}</Button>
        </CardContent>
        {error && <p className="text-sm text-red-500 p-6 pt-0">{error}</p>}
      </Card>
      {isLoading && <p>Loading media library...</p>}
      <div className="space-y-6">
        {Object.entries(groupedMedia).map(([category, files]) => (
          <Card key={category}>
            <CardHeader><CardTitle className="capitalize">{category.replace("_", " ")}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {files.map(file => (
                  <div key={file.id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                        <Music className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <div className="flex flex-col gap-1">
                          {editingId === file.id ? (
                            <>
                              <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="h-8"/>
                              <Input value={editingTrigger} onChange={(e)=> setEditingTrigger(e.target.value.toLowerCase())} className="h-8" placeholder="Trigger keyword (optional)" />
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{file.friendly_name || file.filename.split('_').slice(1).join('_')}</span>
                              {file.trigger_keyword && <span className="text-[10px] uppercase tracking-wide bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{file.trigger_keyword}</span>}
                            </div>
                          )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {editingId === file.id ? (
                           <>
                            <Button onClick={() => handleSaveName(file.id)} variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700"><Save className="w-4 h-4" /></Button>
                            <Button onClick={cancelEditing} variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-700"><XCircle className="w-4 h-4" /></Button>
                           </>
                        ) : (
                            <Button onClick={() => startEditing(file)} variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-700"><Edit className="w-4 h-4" /></Button>
                        )}
                        <Button onClick={() => handleDelete(file.id)} variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};