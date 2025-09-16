import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Rss } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { makeApi } from '@/lib/apiClient';

export default function RssImporter({ onBack, token }) {
    const [rssUrl, setRssUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleImport = async () => {
        if (!rssUrl) {
            toast({ title: "Error", description: "Please enter an RSS feed URL.", variant: "destructive" });
            return;
        }
        setIsLoading(true);
        try {
            const result = await makeApi(token).post('/api/import/rss', { rss_url: rssUrl });
            if (result && result.status && result.status >= 400) throw new Error(result.detail || 'Failed to import from RSS feed.');
            toast({ title: "Import Successful!", description: `Imported "${result.podcast_name}" with ${result.episodes_imported} episodes.` });
            onBack();
        } catch (err) {
            toast({ title: "Import Failed", description: err.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6">
            <Button onClick={onBack} variant="ghost" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
            </Button>
            <Card className="max-w-xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Rss /> Import from RSS Feed
                    </CardTitle>
                    <CardDescription>
                        Enter the URL of a public RSS feed to import a podcast and its episodes for testing.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="rss-url">RSS Feed URL</Label>
                        <Input 
                            id="rss-url" 
                            placeholder="https://example.com/podcast.xml" 
                            value={rssUrl}
                            onChange={(e) => setRssUrl(e.target.value)}
                        />
                    </div>
                    <Button onClick={handleImport} disabled={isLoading} className="w-full">
                        {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing...</> : "Import Podcast"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}