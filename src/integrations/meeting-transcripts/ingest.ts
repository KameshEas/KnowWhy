/**
 * Meeting Transcript Ingestion Service
 * 
 * Handles ingestion of meeting transcripts from:
 * - Zoom API
 * - Google Meet (via upload or API)
 * - Manual uploads (audio files, text files)
 * 
 * Normalizes transcripts into Conversation events with speaker diarization
 */

import { PrismaClient } from '@prisma/client';
import { WebClient } from '@slack/web-api';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

// ============================================================================ 
// TYPES
// ============================================================================

export interface MeetingTranscript {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  duration: number; // seconds
  participants: string[];
  transcript: MeetingSegment[];
  source: 'zoom' | 'google_meet' | 'upload';
  externalId?: string; // zoom meeting id, etc
  metadata: Record<string, any>;
}

export interface MeetingSegment {
  id: string;
  speaker: string;
  startTime: number; // seconds from meeting start
  endTime: number;
  text: string;
  confidence?: number;
}

export interface ZoomMeeting {
  id: string;
  uuid: string;
  host_id: string;
  topic: string;
  type: number;
  start_time: string;
  duration: number;
  timezone: string;
  created_at: string;
  join_url: string;
}

export interface ZoomTranscript {
  id: string;
  meeting_id: string;
  status: string;
  files: Array<{
    id: string;
    type: string;
    file_type: string;
    file_size: number;
    file_url: string;
    delete_url: string;
    download_token: string;
    recording_start: string;
    recording_end: string;
  }>;
}

// ============================================================================ 
// ZOOM INTEGRATION
// ============================================================================

/**
 * Zoom API client for meeting and transcript management
 */
class ZoomClient {
  private clientId: string;
  private clientSecret: string;
  private accountId: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(clientId: string, clientSecret: string, accountId: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accountId = accountId;
  }

  /**
   * Get OAuth access token for Zoom API
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const response = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'grant_type': 'account_credentials',
        'account_id': this.accountId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Zoom OAuth failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in * 1000));
    
    return this.accessToken;
  }

  /**
   * List meetings for the account
   */
  async listMeetings(from: string, to: string, pageSize: number = 30): Promise<ZoomMeeting[]> {
    const token = await this.getAccessToken();
    
    const response = await fetch(
      `https://api.zoom.us/v2/users/me/meetings?type=previous&page_size=${pageSize}&from=${from}&to=${to}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Zoom API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.meetings || [];
  }

  /**
   * Get meeting details
   */
  async getMeeting(meetingId: string): Promise<ZoomMeeting> {
    const token = await this.getAccessToken();
    
    const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Zoom API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get meeting transcripts
   */
  async getMeetingTranscripts(meetingId: string): Promise<ZoomTranscript> {
    const token = await this.getAccessToken();
    
    const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}/recordings`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Zoom API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Download transcript file
   */
  async downloadTranscriptFile(fileUrl: string, downloadToken: string): Promise<string> {
    const token = await this.getAccessToken();
    
    const response = await fetch(fileUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Download-Token': downloadToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download transcript: ${response.status}`);
    }

    return await response.text();
  }
}

// ============================================================================ 
// TRANSCRIPT PROCESSING
// ============================================================================

/**
 * Parse Zoom transcript JSON format into normalized segments
 */
export function parseZoomTranscript(rawTranscript: any): MeetingSegment[] {
  const segments: MeetingSegment[] = [];
  
  if (!rawTranscript?.recording_files) {
    return segments;
  }

  // Find the transcript file
  const transcriptFile = rawTranscript.recording_files.find(
    (file: any) => file.file_type === 'TRANSCRIPT'
  );

  if (!transcriptFile) {
    return segments;
  }

  // Zoom transcript format varies, but typically contains segments
  // This is a simplified parser - real implementation would handle various formats
  try {
    const transcriptText = transcriptFile.transcript_text || '';
    
    // Simple parsing - split by speaker changes
    const lines = transcriptText.split('\n').filter(line => line.trim());
    
    let currentSpeaker = '';
    let currentText = '';
    let startTime = 0;

    for (const line of lines) {
      const speakerMatch = line.match(/^([A-Za-z\s]+):/);
      
      if (speakerMatch) {
        // Save previous segment
        if (currentSpeaker && currentText) {
          segments.push({
            id: crypto.randomUUID(),
            speaker: currentSpeaker,
            startTime,
            endTime: startTime + currentText.length * 0.1, // rough estimate
            text: currentText.trim(),
          });
          startTime += currentText.length * 0.1;
        }
        
        // Start new segment
        currentSpeaker = speakerMatch[1].trim();
        currentText = line.replace(/^([A-Za-z\s]+):/, '').trim();
      } else {
        currentText += ' ' + line.trim();
      }
    }

    // Save final segment
    if (currentSpeaker && currentText) {
      segments.push({
        id: crypto.randomUUID(),
        speaker: currentSpeaker,
        startTime,
        endTime: startTime + currentText.length * 0.1,
        text: currentText.trim(),
      });
    }

  } catch (error) {
    console.error('Error parsing Zoom transcript:', error);
  }

  return segments;
}

/**
 * Parse manual transcript upload (supports various formats)
 */
export async function parseUploadedTranscript(
  filePath: string, 
  format: 'vtt' | 'srt' | 'txt' | 'json'
): Promise<MeetingSegment[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const segments: MeetingSegment[] = [];

  switch (format) {
    case 'vtt':
      return parseVTT(content);
    case 'srt':
      return parseSRT(content);
    case 'txt':
      return parseTextTranscript(content);
    case 'json':
      return parseJSONTranscript(content);
    default:
      throw new Error(`Unsupported transcript format: ${format}`);
  }
}

/**
 * Parse WebVTT format
 */
function parseVTT(content: string): MeetingSegment[] {
  const segments: MeetingSegment[] = [];
  const lines = content.split('\n');
  let currentSegment: Partial<MeetingSegment> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip VTT header
    if (line === 'WEBVTT' || line.startsWith('NOTE')) continue;
    
    // Timecode line
    if (line.includes('-->')) {
      const timeMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/);
      if (timeMatch) {
        currentSegment.startTime = parseVTTTime(timeMatch[1]);
        currentSegment.endTime = parseVTTTime(timeMatch[2]);
      }
    }
    // Text line
    else if (line && !currentSegment.text) {
      currentSegment.text = line;
      currentSegment.id = crypto.randomUUID();
      currentSegment.speaker = 'Unknown'; // VTT doesn't include speaker info
      
      if (currentSegment.startTime !== undefined && currentSegment.endTime !== undefined) {
        segments.push(currentSegment as MeetingSegment);
        currentSegment = {};
      }
    }
  }

  return segments;
}

/**
 * Parse SRT format
 */
function parseSRT(content: string): MeetingSegment[] {
  const segments: MeetingSegment[] = [];
  const blocks = content.split('\n\n').filter(block => block.trim());
  
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
      if (timeMatch) {
        segments.push({
          id: crypto.randomUUID(),
          speaker: 'Unknown',
          startTime: parseSRTTime(timeMatch[1]),
          endTime: parseSRTTime(timeMatch[2]),
          text: lines.slice(2).join(' ').trim(),
        });
      }
    }
  }

  return segments;
}

/**
 * Parse plain text transcript (simple format: "Speaker: Text")
 */
function parseTextTranscript(content: string): MeetingSegment[] {
  const segments: MeetingSegment[] = [];
  const lines = content.split('\n').filter(line => line.trim());
  
  let currentSpeaker = '';
  let currentText = '';
  let startTime = 0;

  for (const line of lines) {
    const speakerMatch = line.match(/^([A-Za-z\s]+):/);
    
    if (speakerMatch) {
      if (currentSpeaker && currentText) {
        segments.push({
          id: crypto.randomUUID(),
          speaker: currentSpeaker,
          startTime,
          endTime: startTime + 10, // rough estimate
          text: currentText.trim(),
        });
        startTime += 10;
      }
      
      currentSpeaker = speakerMatch[1].trim();
      currentText = line.replace(/^([A-Za-z\s]+):/, '').trim();
    } else {
      currentText += ' ' + line.trim();
    }
  }

  if (currentSpeaker && currentText) {
    segments.push({
      id: crypto.randomUUID(),
      speaker: currentSpeaker,
      startTime,
      endTime: startTime + 10,
      text: currentText.trim(),
    });
  }

  return segments;
}

/**
 * Parse JSON transcript format
 */
function parseJSONTranscript(content: string): MeetingSegment[] {
  try {
    const data = JSON.parse(content);
    
    if (Array.isArray(data.segments)) {
      return data.segments.map((seg: any) => ({
        id: seg.id || crypto.randomUUID(),
        speaker: seg.speaker || 'Unknown',
        startTime: seg.start_time || seg.startTime || 0,
        endTime: seg.end_time || seg.endTime || (seg.start_time || seg.startTime || 0) + 10,
        text: seg.text || seg.transcript || '',
        confidence: seg.confidence,
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error parsing JSON transcript:', error);
    return [];
  }
}

/**
 * Convert VTT time format to seconds
 */
function parseVTTTime(timeStr: string): number {
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  const [sec, ms] = seconds.toString().split('.');
  return (hours * 3600) + (minutes * 60) + Number(sec) + (Number(ms || '0') / 1000);
}

/**
 * Convert SRT time format to seconds
 */
function parseSRTTime(timeStr: string): number {
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  const [sec, ms] = seconds.toString().split(',');
  return (hours * 3600) + (minutes * 60) + Number(sec) + (Number(ms || '0') / 1000);
}

// ============================================================================ 
// INGESTION SERVICE
// ============================================================================

/**
 * Main service for ingesting meeting transcripts
 */
class MeetingTranscriptService {
  private zoomClient: ZoomClient | null = null;

  constructor() {
    const zoomClientId = process.env.ZOOM_CLIENT_ID;
    const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;
    const zoomAccountId = process.env.ZOOM_ACCOUNT_ID;

    if (zoomClientId && zoomClientSecret && zoomAccountId) {
      this.zoomClient = new ZoomClient(zoomClientId, zoomClientSecret, zoomAccountId);
    }
  }

  /**
   * Ingest Zoom meeting transcripts
   */
  async ingestZoomMeetings(fromDate: Date, toDate: Date): Promise<void> {
    if (!this.zoomClient) {
      throw new Error('Zoom credentials not configured');
    }

    const meetings = await this.zoomClient.listMeetings(
      fromDate.toISOString().split('T')[0],
      toDate.toISOString().split('T')[0]
    );

    for (const meeting of meetings) {
      try {
        const transcripts = await this.zoomClient.getMeetingTranscripts(meeting.id);
        
        if (transcripts.files && transcripts.files.length > 0) {
          for (const file of transcripts.files) {
            if (file.file_type === 'TRANSCRIPT') {
              const transcriptText = await this.zoomClient.downloadTranscriptFile(
                file.file_url, 
                file.download_token
              );
              
              const segments = parseZoomTranscript({ transcript_text: transcriptText });
              await this.saveMeetingTranscript({
                id: crypto.randomUUID(),
                title: meeting.topic,
                startTime: new Date(meeting.start_time),
                endTime: new Date(new Date(meeting.start_time).getTime() + (meeting.duration * 60000)),
                duration: meeting.duration * 60,
                participants: [], // Zoom API doesn't provide participant list in this endpoint
                transcript: segments,
                source: 'zoom',
                externalId: meeting.id,
                metadata: { zoom_meeting_id: meeting.id, zoom_uuid: meeting.uuid },
              });
            }
          }
        }
      } catch (error) {
        console.error(`Failed to ingest Zoom meeting ${meeting.id}:`, error);
      }
    }
  }

  /**
   * Ingest uploaded transcript file
   */
  async ingestUploadedTranscript(
    filePath: string,
    format: 'vtt' | 'srt' | 'txt' | 'json',
    title: string,
    startTime: Date,
    participants: string[] = []
  ): Promise<void> {
    const segments = await parseUploadedTranscript(filePath, format);
    
    await this.saveMeetingTranscript({
      id: crypto.randomUUID(),
      title,
      startTime,
      endTime: new Date(startTime.getTime() + (segments.length * 10000)), // rough estimate
      duration: segments.length * 10,
      participants,
      transcript: segments,
      source: 'upload',
      metadata: { file_path: filePath, format },
    });
  }

  /**
   * Save meeting transcript as Conversation events
   */
  private async saveMeetingTranscript(transcript: MeetingTranscript): Promise<void> {
    const systemUser = await this.ensureSystemUser();
    
    for (const segment of transcript.transcript) {
      const conversationData = {
        title: `${transcript.title} - ${segment.speaker}`,
        content: segment.text,
        source: transcript.source,
        author: segment.speaker,
        timestamp: new Date(transcript.startTime.getTime() + (segment.startTime * 1000)),
        userId: systemUser.id,
        externalId: transcript.externalId ? `${transcript.externalId}:${segment.id}` : segment.id,
        metadata: {
          meeting_id: transcript.id,
          meeting_title: transcript.title,
          speaker: segment.speaker,
          start_time: segment.startTime,
          end_time: segment.endTime,
          confidence: segment.confidence,
          participants: transcript.participants,
          duration: transcript.duration,
        },
      };

      try {
        await prisma.conversation.create({
          data: conversationData,
        });
      } catch (error) {
        // Handle duplicate externalId (idempotent)
        if (error.code !== 'P2002') {
          throw error;
        }
      }
    }
  }

  /**
   * Ensure system user exists for imported conversations
   */
  private async ensureSystemUser() {
    const existing = await prisma.user.findUnique({ 
      where: { email: 'system@knowwhy.internal' } 
    });
    
    if (existing) return existing;
    
    return prisma.user.create({
      data: {
        email: 'system@knowwhy.internal',
        name: 'System',
        password: crypto.randomBytes(16).toString('hex'),
      },
    });
  }
}

export { ZoomClient, MeetingTranscriptService };
