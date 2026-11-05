import { Injectable } from '@nestjs/common';

type TravelMeeting = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location?: {
    label?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  };
};

@Injectable()
export class CalendarTravelTimeService {
  private readonly averageRoadSpeedKph = 30;
  private readonly roadDistanceFactor = 1.25;

  assess(meetings: TravelMeeting[], bufferMinutes: number, limit: number) {
    const physical = meetings.filter((meeting) => this.hasCoordinates(meeting));
    const conflicts: Array<Record<string, unknown>> = [];
    const ordered = [...meetings].sort(
      (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
    );
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (!this.hasCoordinates(previous) || !this.hasCoordinates(current)) continue;
      const directDistanceKm = this.distanceKm(previous.location, current.location);
      const estimatedRoadDistanceKm = directDistanceKm * this.roadDistanceFactor;
      const estimatedTravelMinutes = Math.max(
        1,
        Math.ceil((estimatedRoadDistanceKm / this.averageRoadSpeedKph) * 60),
      );
      const availableMinutes = Math.floor(
        (current.startsAt.getTime() - previous.endsAt.getTime()) / 60_000,
      );
      const requiredMinutes = estimatedTravelMinutes + bufferMinutes;
      if (availableMinutes < requiredMinutes) {
        conflicts.push({
          type: 'INSUFFICIENT_TRAVEL_TIME',
          meetingIds: [previous.id, current.id],
          meetings: [previous.title, current.title],
          availableMinutes,
          estimatedTravelMinutes,
          requiredBufferMinutes: bufferMinutes,
          shortfallMinutes: requiredMinutes - availableMinutes,
          estimatedRoadDistanceKm: Number(estimatedRoadDistanceKm.toFixed(1)),
          isEstimated: true,
        });
        if (conflicts.length >= limit) break;
      }
    }

    const availability =
      meetings.length === 0 || physical.length === meetings.length
        ? 'AVAILABLE'
        : physical.length
          ? 'PARTIAL'
          : 'UNAVAILABLE';
    return {
      availability,
      eligibleMeetings: physical.length,
      unavailableMeetings: meetings.length - physical.length,
      conflicts,
      methodology: {
        version: 'COORDINATE_DISTANCE_ESTIMATE_V1',
        averageRoadSpeedKph: this.averageRoadSpeedKph,
        roadDistanceFactor: this.roadDistanceFactor,
        isEstimated: true,
      },
      ...(physical.length
        ? {}
        : { reason: 'MEETING_COORDINATES_NOT_AVAILABLE' }),
    };
  }

  private hasCoordinates(
    meeting: TravelMeeting,
  ): meeting is TravelMeeting & {
    location: { latitude: number; longitude: number };
  } {
    return (
      typeof meeting.location?.latitude === 'number' &&
      Number.isFinite(meeting.location.latitude) &&
      typeof meeting.location.longitude === 'number' &&
      Number.isFinite(meeting.location.longitude)
    );
  }

  private distanceKm(
    left: { latitude: number; longitude: number },
    right: { latitude: number; longitude: number },
  ) {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const latitudeDelta = radians(right.latitude - left.latitude);
    const longitudeDelta = radians(right.longitude - left.longitude);
    const value =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(left.latitude)) *
        Math.cos(radians(right.latitude)) *
        Math.sin(longitudeDelta / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }
}
